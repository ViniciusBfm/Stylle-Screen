# StylleScreen HD

App de captura de tela para Windows. Fica no ícone perto do relógio, abre com um atalho, deixa você selecionar uma área, anotar por cima e copiar ou salvar o resultado em segundos.

![Tela de captura do StylleScreen HD](docs/captura.png)

## O que ele faz

- Captura todos os monitores em resolução real, sem perder nitidez em telas com escala (125%, 150%)
- Seleção de área com ajuste pelas bordas e tamanho em pixels na hora
- Anotações: retângulo, elipse, seta, linha, caneta, marca-texto, texto, numeração e desfoque
- 9 cores e 3 espessuras, e o app lembra a última escolha
- Copia a imagem para colar com Ctrl + V ou salva em PNG
- Atalho de captura configurável, opção de iniciar com o Windows e aviso ao copiar ou salvar

## Atalhos

Para abrir a captura, o padrão é **Ctrl + Alt + S**. Também dá para trocar por Print Screen, Ctrl + Shift + X, Ctrl + Alt + A ou Alt + Shift + S na janela do app.

Na tela de captura:

| Tecla | Ação |
|---|---|
| V | Mover |
| R | Retângulo |
| E | Elipse |
| A | Seta |
| L | Linha |
| P | Caneta |
| H | Marca-texto |
| T | Texto |
| N | Numeração |
| B | Desfoque |
| Ctrl + Z | Desfazer |
| Enter ou Ctrl + C | Copiar |
| Ctrl + S | Salvar |
| Esc | Cancelar |

## Rodar e gerar o instalador

Precisa do [Node.js](https://nodejs.org) instalado.

```
npm install
npm start       # abre o app
npm run dist    # gera o instalador em dist\
npm run icon    # recria o ícone em assets\
```

A opção "Iniciar com o Windows" só funciona no app instalado.

## Estrutura

- `main.js`: bandeja, atalho, janelas, configurações, copiar e salvar
- `preload.js`: ponte entre a interface e o app
- `renderer/home.*`: janela principal com as configurações
- `renderer/overlay.*`: tela de captura e ferramentas de anotação
- `assets/grab.ps1`: auxiliar em PowerShell que fotografa os monitores
- `scripts/make-icon.ps1`: gera o ícone do app

As configurações ficam em `%APPDATA%\StylleScreen HD\settings.json` e as capturas, por padrão, em `Imagens\StylleScreen HD`.

Feito com [Electron](https://www.electronjs.org).
