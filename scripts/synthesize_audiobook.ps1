param(
    [Parameter(Mandatory=$true)][string]$Manifest,
    [Parameter(Mandatory=$true)][string]$Ffmpeg,
    [string]$Voice='Microsoft Daniel'
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$book = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($book.issues.Count -gt 0) { throw 'O PDF ainda tem páginas pendentes de conferência ou OCR. A narração foi bloqueada.' }
$conversionMutex=[System.Threading.Mutex]::new($false,('AudioVerse-'+$book.slug))
if(!$conversionMutex.WaitOne(0)) { $conversionMutex.Dispose(); Write-Output "JA EM EXECUCAO: $($book.slug)"; return }
try {
$workFolder = Split-Path $Manifest -Parent
$existingReport=Join-Path $workFolder 'conversion-report.json'
if(Test-Path -LiteralPath $existingReport) {
    $previous=Get-Content -LiteralPath $existingReport -Raw -Encoding utf8 | ConvertFrom-Json
    if($previous.source_pdf_sha256 -eq $book.pdf_sha256 -and (Test-Path -LiteralPath $previous.output) -and (Get-FileHash -LiteralPath $previous.output -Algorithm SHA256).Hash.ToLowerInvariant() -eq $previous.audio_sha256) { Write-Output "JA CONCLUIDO: $($book.slug)"; return }
}
$privateFolder = Split-Path (Split-Path $workFolder -Parent) -Parent
$audioFolder = Join-Path $privateFolder 'audiobooks'
New-Item -ItemType Directory -Path $audioFolder -Force | Out-Null
$speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$speaker.SelectVoice($Voice)
$speaker.Rate=0
$format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(22050,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)
$parts = [System.Collections.Generic.List[string]]::new()
$completed = [System.Collections.Generic.List[object]]::new()
try {
    foreach ($chunk in $book.chunks) {
        $text=[System.IO.File]::ReadAllText($chunk.text,[System.Text.Encoding]::UTF8)
        $hash=[System.Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($text))).ToLowerInvariant()
        if($hash -ne $chunk.sha256) { throw "Texto modificado no bloco $($chunk.index)." }
        $stem='part-{0:d5}' -f [int]$chunk.index
        $wave=Join-Path $workFolder ($stem+'.wav')
        $mp3=Join-Path $workFolder ($stem+'.mp3')
        if (!(Test-Path -LiteralPath $mp3)) {
            $speaker.SetOutputToWaveFile($wave,$format)
            $speaker.Speak($text)
            $speaker.SetOutputToNull()
            & $Ffmpeg -hide_banner -loglevel error -y -i $wave -ac 1 -ar 22050 -c:a libmp3lame -b:a 64k $mp3
            if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $mp3)) { throw "Falha de codificação no bloco $($chunk.index)." }
            Remove-Item -LiteralPath $wave
        }
        $parts.Add("file '$stem.mp3'")
        $completed.Add([PSCustomObject]@{index=$chunk.index;page=$chunk.page;text_sha256=$hash;audio_sha256=(Get-FileHash -LiteralPath $mp3 -Algorithm SHA256).Hash.ToLowerInvariant()})
        [PSCustomObject]@{title=$book.title;completed=$completed.Count;total=$book.chunks.Count;page=$chunk.page;pages=$book.page_count;voice=$Voice;state='synthesizing'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $workFolder 'progress.json') -Encoding utf8
        if ($completed.Count % 25 -eq 0) { Write-Output "$($book.slug): $($completed.Count)/$($book.chunks.Count) blocos" }
    }
} finally { $speaker.Dispose() }
$concat=Join-Path $workFolder 'concat.txt'
[System.IO.File]::WriteAllLines($concat,$parts,[System.Text.UTF8Encoding]::new($false))
$output=Join-Path $audioFolder ($book.author+' - '+$book.title+'.mp3')
& $Ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i $concat -c:a copy -metadata ('title='+$book.title) -metadata ('artist='+$book.author) -metadata 'album=AudioVerse - Biblioteca pessoal' $output
if ($LASTEXITCODE -ne 0) { throw 'Falha ao reunir os blocos em um único MP3.' }
# Decode the entire final MP3. A valid beginning and ending alone do not establish integrity.
& $Ffmpeg -hide_banner -loglevel error -xerror -i $output -f null -
if ($LASTEXITCODE -ne 0) { throw 'O MP3 final falhou na verificação integral de decodificação.' }
$report=[PSCustomObject]@{title=$book.title;author=$book.author;source_pdf_sha256=$book.pdf_sha256;page_count=$book.page_count;pages=$book.pages;voice=$Voice;rate=0;blocks_expected=$book.chunks.Count;blocks_completed=$completed.Count;blocks=$completed;output=$output;audio_sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $output).Length;full_decode_verified=$true;normalization=$book.normalization;limitations='A narração preserva o texto extraído. Pronúncia e eventuais falhas do texto/OCR de origem exigem revisão humana. Imagens sem texto não são descritas automaticamente.'}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $workFolder 'conversion-report.json') -Encoding utf8
[PSCustomObject]@{title=$book.title;state='completed';output=$output;bytes=$report.bytes} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $workFolder 'progress.json') -Encoding utf8
Write-Output "CONCLUIDO: $output"
} finally { $conversionMutex.ReleaseMutex(); $conversionMutex.Dispose() }
