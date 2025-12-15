# Calculadora de Treliças (Truss Solver MVC)

Uma aplicação web interativa baseada em **ASP.NET Core MVC** para a análise e resolução de treliças planas isostáticas e hiperestáticas. O projeto utiliza o Método da Rigidez (Análise Matricial) para calcular forças axiais em barras e reações de apoio.

<div align="center">

![.NET Version](https://img.shields.io/badge/.NET-9.0-512BD4?style=for-the-badge&logo=dotnet&logoColor=white)

![C#](https://img.shields.io/badge/c%23-%23239120.svg?style=for-the-badge&logo=csharp&logoColor=white)
![Bootstrap](https://img.shields.io/badge/bootstrap-%238511FA.svg?style=for-the-badge&logo=bootstrap&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Konva.js](https://img.shields.io/badge/Konva.js-0D6EFD?style=for-the-badge&logo=html5&logoColor=white)

</div>

## 📋 Sobre o Projeto

A **Calculadora de Treliças** permite a estudantes e engenheiros desenhar estruturas de treliça diretamente no navegador e obter instantaneamente os resultados dos esforços internos. A aplicação combina um backend robusto em C# para os cálculos matemáticos com um frontend interativo utilizando HTML5 Canvas (Konva.js).

### Funcionalidades Principais

* **Editor Gráfico Intuitivo:** Desenha nós e barras com ferramentas de "arrastar e largar".
* **Gestão de Apoios:** Adiciona apoios de 1.º género (Rolete) e 2.º género (Pino/Fixo).
* **Aplicação de Cargas:** Define cargas pontuais com magnitude e ângulo personalizados.
* **Validação em Tempo Real:** Verificação automática da estabilidade da estrutura (Critério de Maxwell) e deteção de mecanismos instáveis.
* **Análise Matricial:** Resolução do sistema linear $A \cdot x = B$ utilizando a biblioteca `MathNet.Numerics`.
* **Visualização de Resultados:**
    * Código de cores para barras (Azul = Tração, Vermelho = Compressão).
    * Diagramas vetoriais das reações de apoio.
    * Exibição numérica dos esforços.
* **Templates Prontos:** Geração automática de treliças comuns (Warren, Pratt, Howe).
* **Histórico de Ações:** Funcionalidades de desfazer/refazer e guardar sessões no navegador.

## 🛠️ Tecnologias Utilizadas

### Backend
* **C# / ASP.NET Core MVC (.NET 9.0)**: Estrutura principal da aplicação.
* **MathNet.Numerics**: Biblioteca para operações de álgebra linear (matrizes e vetores).

### Frontend
* **JavaScript (ES6+)**: Lógica de interação do cliente.
* **Konva.js**: Biblioteca de Canvas 2D para renderização gráfica da treliça.
* **Bootstrap 5**: Framework CSS para layout responsivo e modais.
* **SweetAlert2**: Para alertas e confirmações visuais.

## 📖 Como Usar

1.  **Desenhar a Estrutura:**
    * Seleciona a ferramenta **Barra** e clica na grelha para criar nós e ligá-los.
    * Usa o **Botão Direito** do rato para mover o ecrã (Pan).
    * Usa a **Roda do Rato** para fazer Zoom.

2.  **Definir Condições de Fronteira:**
    * Seleciona **Apoio Fixo** (Pino) ou **Apoio Móvel** (Rolete) e aplica nos nós desejados.

3.  **Aplicar Carregamentos:**
    * Seleciona a ferramenta **Carga**, define o valor (em Newtons) e o ângulo, e clica no nó onde a força atua.

4.  **Calcular:**
    * Clica no botão **Analisar Treliça**.
    * Se a estrutura for estável, os resultados aparecerão na barra lateral e o diagrama será colorido conforme os esforços (Tração/Compressão).

## 🧠 Estrutura do Código

A solução segue o padrão MVC (Model-View-Controller):

* `/Models`: Contém as definições de dados (`DadosTrelica`, `No`, `Barra`) e o modelo de resultado.
* `/Services`: Lógica de engenharia. O ficheiro `ServicoCalculoTrelica.cs` implementa a montagem da matriz de rigidez global e a resolução do sistema linear.
* `/Controllers`: Gere as requisições HTTP e comunica com os serviços.
* `/wwwroot/js/app-trelica.js`: Contém toda a lógica de desenho, manipulação do Canvas (Konva.js) e comunicação assíncrona (Fetch API) com o backend.

## 👥 Autores

Este projeto foi desenvolvido em colaboração por:

* **Paulo Carvalho**
* **Luigi Guilherme** 

---

<div align="center">

**[Tutorial de Calculadora de Treliças Online](https://www.youtube.com/watch?v=6Pqx3zVhuRw)**
<br>
*Este vídeo demonstra conceitos visuais de análise de treliças que serviram de inspiração para as funcionalidades deste projeto.*

</div>
