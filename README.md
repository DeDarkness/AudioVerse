# AudioVerse

Seu espaço para ouvir. PWA pessoal em português, com visual escuro e verde inspirado no MeuTreino.

**Abrir:** https://dedarkness.github.io/AudioVerse/

## No iPhone

1. Abra o endereço no **Safari**.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Abra pelo ícone AudioVerse.
4. Para o acervo privado, abra **Ajustes → Google Drive privado**, conecte sua conta Google e carregue o catálogo. Também é possível usar **Adicionar áudio** para importar arquivos do app Arquivos.
5. Escolha um título e espere o preparo do MP3 no aparelho antes de iniciar a reprodução.
6. A posição é salva automaticamente. Os detalhes do áudio permitem criar marcadores e marcar como lido ou não lido.

É necessário acessar uma vez com internet para preparar a interface offline. Os arquivos importados ficam no navegador/aplicativo em que a importação foi feita, naquele aparelho. Importar no Safari e depois abrir pelo ícone pode exigir nova importação, conforme o isolamento de armazenamento da versão do iOS.

## Recursos

- Importação de vários arquivos, armazenados em IndexedDB, sem upload de áudio.
- Reprodução por um único `HTMLAudioElement`, preservado ao navegar entre biblioteca e ajustes.
- Play/pause, avanço e retrocesso de 15 segundos e busca por posição.
- Velocidades de 0,75× a 2×, progresso salvo, favoritos e marcadores.
- Título e autor editáveis; busca e filtros de andamento/conclusão.
- Marcação manual de lido/não lido, independente da posição de reprodução, com filtros e backup.
- Arquivos nomeados `Autor - Título - Parte 01 de 04.mp3` recebem autor, título e sequência automaticamente; ao terminar uma parte, o player tenta continuar na próxima parte já importada, usando o mesmo elemento de áudio.
- Temporizador de 15, 30, 45 ou 60 minutos, baseado em horário absoluto.
- Media Session com título, autor, capa, play/pause e comandos de posição.
- Interface offline com service worker, ícones e manifesto instalável.
- Exportação/restauração de progresso JSON e download do arquivo original por áudio.
- Detecção de duplicatas pelo nome, tamanho e data de modificação do arquivo.

Formatos aceitos para importação: MP3, M4A, M4B, AAC, WAV, OGG e FLAC. Codecs e contêineres realmente reproduzíveis variam por navegador. M4B é tratado como um arquivo de áudio; capítulos e capas embutidos não são extraídos automaticamente. MP3 é uma escolha prática para compatibilidade.

O aplicativo não sintetiza narração de PDFs e não distribui audiolivros no site público. Importar um arquivo não verifica a integralidade do conteúdo narrado.

## Tela bloqueada e segundo plano

A implementação usa as APIs de mídia do navegador e solicita `navigator.audioSession.type = 'playback'` onde disponível. Não há áudio silencioso, truques de autoplay ou dependência de Web Audio para reproduzir livros.

Os comandos Media Session são implementados e cobertos por testes de navegador, mas isso **não comprova funcionamento no iPhone físico**. O Safari/iOS controla a sessão e pode suspender o aplicativo, atrasar o temporizador ou impedir a retomada após uma interrupção. Fechar o aplicativo à força encerra sua execução.

Antes de considerar o requisito de segundo plano validado no aparelho:

- Reproduzir um arquivo importado por pelo menos 10 minutos com a tela bloqueada.
- Pausar e retomar pela tela bloqueada e pela Central de Controle.
- Avançar e retroceder com esses controles quando oferecidos pelo iOS.
- Interromper com chamada/Siri/fones e retomar.
- Abrir em modo avião após preparar o offline e importar os arquivos.
- Conferir se o temporizador pausa no horário com a tela bloqueada.
- Reabrir e verificar a posição salva, inclusive em um arquivo de várias horas.

Se o iOS limitar esses comportamentos, um app nativo com sessão de áudio de playback, modo de áudio em segundo plano e comandos remotos será necessário para maior confiabilidade. Este repositório contém a PWA; não inclui um binário iOS assinado.

## Armazenamento e backup

Áudio e metadados são separados no banco: listar a biblioteca não carrega todos os arquivos na memória. A importação grava blocos de 4 MiB como ArrayBuffers. Com o service worker ativo, a reprodução usa uma rota local com suporte a HTTP Range e lê esses blocos conforme o player solicita; nenhum arquivo ou trecho de áudio é enviado ao servidor. Esse caminho permite buscar posições distantes sem reconstruir o arquivo inteiro na memória. Sem service worker controlador, existe um fallback de Blob. O livro só aparece depois de todos os blocos serem salvos e da confirmação final de metadados. Erros de cota removem a importação incompleta. Resíduos de importações interrompidas ao fechar o app são removidos após 24 horas no próximo acesso.

O navegador pode remover armazenamento local. O pedido de persistência pode ser negado, especialmente no iOS. Mantenha os arquivos originais. O backup JSON contém somente títulos, autores, posições, favoritos e marcadores. Para restaurar em outro aparelho, importe os mesmos arquivos e depois o JSON; a correspondência usa nome, tamanho e data de modificação. Arquivos alterados ou recriados podem não corresponder.

Arquivos locais funcionam sem login. A conexão opcional ao Google Drive usa OAuth de leitura e precisa de configuração própria, descrita em [GOOGLE-DRIVE.md](GOOGLE-DRIVE.md). O catálogo aparece dentro do AudioVerse; o MP3 escolhido é preparado em blocos no aparelho antes de tocar e pode ser ouvido offline depois. Tokens Google ficam somente na memória. Não há sincronização de progresso entre aparelhos nem analytics. O código é público no GitHub Pages; áudios e backups não são enviados pelo aplicativo ao repositório.

## Desenvolvimento

Requer Node.js 22 ou superior.

```sh
npm ci
npm run dev
```

Abra `http://127.0.0.1:4173`. Não use `file://`: módulos, IndexedDB e service worker precisam de uma origem HTTP/HTTPS. O servidor de desenvolvimento escuta somente no computador local.

```sh
npm run check
npm test
npx playwright install chromium webkit
npm run test:browser
npm run build
```

O build gera `dist/` apenas com interface, código e ícones. O workflow valida e publica pelo GitHub Pages a cada push em `main`. Configure Pages com fonte **GitHub Actions**. Áudios e backups nunca devem ser adicionados ao Git.

Ao alterar arquivos da interface, atualize a versão do cache em `sw.js` e a versão do aplicativo. Atualizações aguardam o próximo encerramento da sessão para não substituir o player durante a reprodução.

Os testes de navegador criam um WAV sintético de 45 segundos como fixture, verificam o estado real do elemento de mídia, persistência, interface móvel e abertura offline. Um segundo fixture atravessa o limite de blocos de 4 MiB e tem todos os bytes conferidos por SHA-256 antes e depois de reabrir offline. Isso não substitui teste com MP3 longo nem com o iOS real.

Neste Windows, o WebKit do Playwright rejeitou o WAV original e o restaurado com `MEDIA_ERR_SRC_NOT_SUPPORTED`; por isso, quatro testes que exigem decodificação de áudio são explicitamente ignorados somente nessa combinação. Testes de armazenamento e interface continuam rodando no WebKit. No CI Linux, os testes de playback dos dois navegadores são executados. Os codecs disponíveis dependem do sistema; o [Playwright recomenda macOS para a maior proximidade com o Safari em testes de mídia](https://playwright.dev/docs/browsers#webkit).

Referências: [Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API), [sessão de áudio no navegador](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/audioSession), [playback em apps nativos Apple](https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback).

## Conversão pessoal de PDFs no Windows

Os scripts `scripts/prepare_audiobooks.py` e `scripts/synthesize_audiobook.ps1` permitem preparar narração local com uma voz portuguesa instalada no Windows e FFmpeg. `scripts/package_audiobooks.py` reúne blocos inteiros em volumes menores que 100 MiB para envio privado e importação no celular. A sequência de todos os blocos é conferida, sem cortar uma narração no meio para dividir o arquivo. Arquivos pessoais e temporários de processamento ficam em `private/`, ignorado pelo Git e excluído do build publicado. Nesta entrega, o destino definitivo dos MP3s é o Google Drive privado; o GitHub hospeda o aplicativo. Remova PDFs e textos temporários após o processamento e os MP3s temporários depois de conferir a cópia enviada ao Drive. Os MP3s podem ser importados pelo seletor de arquivos ou preparados dentro do app pela conexão privada Google Drive, após configurar o OAuth.

A preparação extrai todas as páginas, divide o texto sem truncar parágrafos e registra hashes dos blocos. Páginas com imagem e pouco texto bloqueiam a síntese até receberem OCR ou transcrição conferida. A síntese verifica cada bloco e decodifica o MP3 final por inteiro. Essa checagem confirma a integridade técnica; pronúncia, erros já presentes no OCR de origem e pequenos textos ilegíveis exigem revisão humana. Não publique obras protegidas ou documentos privados junto com o site.
