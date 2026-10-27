"""Package verified narration blocks into uploadable private MP3 volumes."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
import imageio_ffmpeg

root=Path(sys.argv[1]).resolve()
limit=85*1024*1024
results=[]
for folder in sorted((root/'work').iterdir()):
    report_path=folder/'conversion-report.json'
    if not report_path.exists(): continue
    report=json.loads(report_path.read_text(encoding='utf-8-sig'))
    manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    if not report['full_decode_verified'] or report['blocks_completed']!=report['blocks_expected']:
        raise RuntimeError('Livro não foi verificado: '+manifest['slug'])
    destination=root/'drive-ready'/manifest['slug']
    destination.mkdir(parents=True,exist_ok=True)
    groups=[];current=[];current_size=0
    for chunk in report['blocks']:
        audio=folder/f"part-{chunk['index']:05d}.mp3"
        if hashlib.sha256(audio.read_bytes()).hexdigest()!=chunk['audio_sha256']:
            raise RuntimeError('Bloco alterado: '+str(audio))
        if current and current_size+audio.stat().st_size>limit:
            groups.append(current);current=[];current_size=0
        current.append(audio);current_size+=audio.stat().st_size
    if current: groups.append(current)
    if [int(p.stem.split('-')[-1]) for group in groups for p in group] != list(range(1,report['blocks_expected']+1)):
        raise RuntimeError('A sequência dos blocos não foi preservada.')
    entries=[]
    for index,group in enumerate(groups,1):
        title=manifest['title']+(f' - Parte {index:02d} de {len(groups):02d}' if len(groups)>1 else '')
        output=destination/(manifest['author']+' - '+title+'.mp3')
        if not output.exists():
            concat=folder/f'volume-{index:02d}.txt'
            concat.write_text('\n'.join("file '"+p.name+"'" for p in group),encoding='utf-8')
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-c:a','copy','-metadata','title='+title,'-metadata','artist='+manifest['author'],'-metadata','album='+manifest['title'],str(output)],check=True)
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-xerror','-i',str(output),'-f','null','-'],check=True)
        if output.stat().st_size>=100*1024*1024:raise RuntimeError('Volume excedeu o limite de envio.')
        entries.append({'path':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'first_block':int(group[0].stem.split('-')[-1]),'last_block':int(group[-1].stem.split('-')[-1]),'part':index,'parts':len(groups)})
    results.append({'slug':manifest['slug'],'title':manifest['title'],'author':manifest['author'],'pages':manifest['page_count'],'volumes':entries})
(root/'upload-plan.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{'title':r['title'],'volumes':len(r['volumes']),'bytes':sum(v['bytes'] for v in r['volumes'])} for r in results],ensure_ascii=True))
