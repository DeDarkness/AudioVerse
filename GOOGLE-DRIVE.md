# Conexão privada do Google Drive

A versão 1.2 prepara a conexão, mas precisa de um **Client ID OAuth Web do próprio AudioVerse**. O login do conector Google Drive no Codex não autoriza automaticamente o aplicativo publicado. Nenhum token do conector é copiado para o app.

## Configuração inicial, na conta do proprietário

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) e crie ou selecione um projeto pessoal chamado AudioVerse.
2. Ative a [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com).
3. Em **Google Auth Platform**, configure o nome AudioVerse, o e-mail de suporte e o contato do desenvolvedor. Para uso pessoal, configure o público e os usuários de teste conforme o console solicitar; inclua a própria conta que contém os audiolivros.
4. Em **Acesso a dados**, solicite somente o escopo `https://www.googleapis.com/auth/drive.readonly`. O app lista o catálogo e lê os MP3s; não precisa modificar arquivos.
5. Em **Clientes**, crie um cliente OAuth do tipo **Aplicativo da Web**. Cadastre a origem JavaScript exata **https://dedarkness.github.io**, sem `/AudioVerse/`. O fluxo de token por popup não usa uma URI de redirecionamento própria.
6. Copie somente o **Client ID**, terminado em `.apps.googleusercontent.com`. Não envie senha, client secret, access token ou refresh token.
7. Para configurar o site em todos os aparelhos, preencha `clientId` em `cloud-config.json` e publique. Esse identificador é público. Como alternativa de preparação, é possível salvá-lo em **Ajustes → Google Drive privado → Configuração inicial da conexão**, naquele navegador.
8. No iPhone, abra o AudioVerse, toque em **Conectar Google Drive** e autorize a leitura na janela do Google. O app procura a pasta **MP3 compactados - Acervo completo** na conta conectada e suas subpastas.

## Como a reprodução funciona

O catálogo é salvo no aparelho. Ao escolher um áudio do Drive, o app baixa aquele MP3 em blocos para o armazenamento local e então usa o mesmo player dos arquivos importados. Depois do preparo, não precisa de conexão para reproduzir esse áudio. Os detalhes permitem liberar a cópia offline e manter os marcadores e a posição. Partes ainda não preparadas exigem internet e uma conexão Google válida.

Os access tokens ficam somente na memória e expiram. Ao fechar o app, pode ser necessário conectar novamente para preparar outro áudio. Os arquivos já preparados continuam offline. Não há sincronização de progresso entre aparelhos e o Google Drive não recebe posições ou marcadores.

Testes com respostas simuladas verificam o catálogo, paginação, falhas de autorização, downloads incompletos, integridade de blocos e preservação de progresso. Eles não comprovam que o OAuth real esteja configurado, nem substituem um teste no iPhone físico.

Referências oficiais: [modelo de token Google](https://developers.google.com/identity/oauth2/web/guides/use-token-model) e [download com a Drive API](https://developers.google.com/workspace/drive/api/guides/manage-downloads).
