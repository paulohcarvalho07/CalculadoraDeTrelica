using MathNet.Numerics.LinearAlgebra;
using TrussSolverMVC.Models;

namespace TrussSolverMVC.Services
{
    public class ServicoCalculoTrelica : IServicoCalculoTrelica
    {
        // Dicionários para mapear "Quem é Quem" na matriz.
        // A Álgebra Linear só entende índices (0, 1, 2...), então precisamos traduzir:
        // Barra com ID 10 -> Coluna 0
        // Reação Rx do Nó 1 -> Coluna 1
        private readonly Dictionary<int, int> _idBarraParaColunaMatriz = new();
        private readonly Dictionary<string, int> _idReacaoParaColunaMatriz = new();
        private int _numReacoes;

        public ResultadoTrelica Calcular(DadosTrelica dados)
        {
            // =================================================================================
            // PASSO 1: PREPARAÇÃO (Mapeamento)
            // =================================================================================
            // Antes de calcular, precisamos saber quantas incógnitas existem e onde elas ficarão na matriz.
            MapearIncognitas(dados);

            int numNos = dados.Nos.Count;
            int numBarras = dados.Barras.Count;

            // Na estática plana, cada nó gera 2 equações de equilíbrio: ΣFx = 0 e ΣFy = 0.
            int numEquacoes = 2 * numNos;

            // As incógnitas são as forças internas nas barras e as reações externas nos apoios.
            int numIncognitas = numBarras + _numReacoes;

            // 2. Verificação de Estabilidade (Critério de Maxwell)
            // Para resolver um sistema linear, precisamos de uma matriz quadrada (n equações para n incógnitas).
            if (numEquacoes != numIncognitas)
            {
                throw new InvalidOperationException($"Treliça estaticamente indeterminada ou instável. Equações: {numEquacoes}, Incógnitas: {numIncognitas}");
            }

            // =================================================================================
            // PASSO 2: A ESTRATÉGIA MATRICIAL (A * x = B)
            // =================================================================================
            // Matriz A (Rigidez/Geometria): Contém os coeficientes (senos, cossenos e 1s).
            // Vetor B (Cargas): Contém as forças externas conhecidas.
            // Vetor x (Incógnitas): O que queremos descobrir (Forças nas Barras e Reações).
            var A = Matrix<double>.Build.Dense(numEquacoes, numIncognitas);
            var B = Vector<double>.Build.Dense(numEquacoes);

            // Cria um mapa rápido para buscar coordenadas dos nós pelo ID
            var mapaNos = dados.Nos.ToDictionary(n => n.Id);

            // =================================================================================
            // PASSO 3: MONTAGEM (Traduzindo a Física para Matemática)
            // =================================================================================
            // Preenchemos a Matriz A e o Vetor B aplicando o Método dos Nós em cada junção.
            MontarMatrizes(dados, mapaNos, A, B);

            // =================================================================================
            // PASSO 4: RESOLUÇÃO (A Mágica da Álgebra Linear)
            // =================================================================================

            // Verificação de Estabilidade Geométrica:
            // Se o determinante for zero, a matriz é singular. Isso significa que a estrutura é um mecanismo
            // (ela se move/cai) ou as equações são dependentes.
            if (Math.Abs(A.Determinant()) < 1e-9)
            {
                throw new InvalidOperationException("A estrutura é instável (Matriz Singular). Verifique se há apoios suficientes e se a geometria não forma um mecanismo móvel.");
            }

            // Resolve o sistema linear A.x = B
            // O computador encontra o vetor 'x' que satisfaz todas as equações de equilíbrio simultaneamente.
            var x = A.Solve(B);

            // =================================================================================
            // PASSO 5: SAÍDA (Formatação)
            // =================================================================================
            // Convertemos os números puros do vetor 'x' de volta para objetos (Barras e Reações)
            return FormatarResultados(x);
        }

        private void MapearIncognitas(DadosTrelica dados)
        {
            _idBarraParaColunaMatriz.Clear();
            _idReacaoParaColunaMatriz.Clear();
            _numReacoes = 0;
            int colunaAtual = 0;

            // Atribui uma coluna da matriz para cada barra
            foreach (var barra in dados.Barras)
            {
                _idBarraParaColunaMatriz[barra.Id] = colunaAtual++;
            }

            // Atribui colunas para as reações dependendo do tipo de apoio
            foreach (var apoio in dados.Apoios)
            {
                if (apoio.Tipo == TipoApoio.Pino)
                {
                    // Pino restringe X e Y (duas incógnitas)
                    _idReacaoParaColunaMatriz[$"R{apoio.IdNo}x"] = colunaAtual++;
                    _idReacaoParaColunaMatriz[$"R{apoio.IdNo}y"] = colunaAtual++;
                    _numReacoes += 2;
                }
                else if (apoio.Tipo == TipoApoio.RoleteY)
                {
                    // Restringe apenas Y
                    _idReacaoParaColunaMatriz[$"R{apoio.IdNo}y"] = colunaAtual++;
                    _numReacoes += 1;
                }
                else if (apoio.Tipo == TipoApoio.RoleteX)
                {
                    // Restringe apenas X
                    _idReacaoParaColunaMatriz[$"R{apoio.IdNo}x"] = colunaAtual++;
                    _numReacoes += 1;
                }
            }
        }

        private void MontarMatrizes(DadosTrelica dados, Dictionary<int, No> mapaNos, Matrix<double> A, Vector<double> B)
        {
            // Iteramos sobre CADA NÓ da treliça para montar as equações de equilíbrio
            foreach (var no in dados.Nos)
            {
                // Mapeia as linhas da matriz para este nó
                // Linha par = Equação de Forças em X
                // Linha ímpar = Equação de Forças em Y
                int linhaX = no.Id * 2;
                int linhaY = no.Id * 2 + 1;

                // ---------------------------------------------------------
                // 1. CARGAS EXTERNAS (Preenchimento do Vetor B)
                // ---------------------------------------------------------
                var carga = dados.Cargas.FirstOrDefault(c => c.IdNo == no.Id);
                if (carga != null)
                {
                    // Equação Fundamental: Σ(F_internas) + Σ(F_externas) = 0
                    // Matematicamente, passamos a externa para o lado direito da igualdade:
                    // Σ(F_internas) = - Σ(F_externas)
                    // Por isso, invertemos o sinal da carga ao inseri-la no Vetor B.
                    B[linhaX] = -carga.Fx;
                    B[linhaY] = -carga.Fy;
                }

                // ---------------------------------------------------------
                // 2. REAÇÕES DE APOIO (Preenchimento da Matriz A)
                // ---------------------------------------------------------
                // Se existe apoio, existe uma força de reação "segurando" o nó.
                // Colocamos "1.0" na coluna correspondente para indicar sua presença na equação.
                var apoio = dados.Apoios.FirstOrDefault(a => a.IdNo == no.Id);
                if (apoio != null)
                {
                    if (apoio.Tipo == TipoApoio.Pino)
                    {
                        A[linhaX, _idReacaoParaColunaMatriz[$"R{no.Id}x"]] = 1.0;
                        A[linhaY, _idReacaoParaColunaMatriz[$"R{no.Id}y"]] = 1.0;
                    }
                    else if (apoio.Tipo == TipoApoio.RoleteY)
                    {
                        A[linhaY, _idReacaoParaColunaMatriz[$"R{no.Id}y"]] = 1.0;
                    }
                    else if (apoio.Tipo == TipoApoio.RoleteX)
                    {
                        A[linhaX, _idReacaoParaColunaMatriz[$"R{no.Id}x"]] = 1.0;
                    }
                }

                // ---------------------------------------------------------
                // 3. FORÇAS DAS BARRAS (Preenchimento da Matriz A)
                // ---------------------------------------------------------
                // Projetamos a força de cada barra conectada nas direções X e Y (Decomposição de Vetores).
                var barrasConectadas = dados.Barras.Where(b => b.IdNoInicial == no.Id || b.IdNoFinal == no.Id);
                foreach (var barra in barrasConectadas)
                {
                    var noInicial = mapaNos[barra.IdNoInicial];
                    var noFinal = mapaNos[barra.IdNoFinal];

                    // Cálculo dos Cossenos Diretores (Geometria)
                    double dx = noFinal.X - noInicial.X;
                    double dy = noFinal.Y - noInicial.Y;
                    double comprimento = Math.Sqrt(dx * dx + dy * dy);

                    // cosTheta = Projeção em X / Hipotenusa
                    // sinTheta = Projeção em Y / Hipotenusa
                    double cosTheta = dx / comprimento;
                    double sinTheta = dy / comprimento;

                    int coluna = _idBarraParaColunaMatriz[barra.Id];

                    // Definição de Sentido (Convenção de Sinais):
                    // Assumimos que a barra está tracionando (puxando o nó).
                    // Se estamos no Nó Inicial, o vetor aponta para o Nó Final (+cos, +sin).
                    // Se estamos no Nó Final, o vetor aponta para o Nó Inicial (-cos, -sin).
                    if (no.Id == barra.IdNoInicial)
                    {
                        A[linhaX, coluna] = cosTheta;
                        A[linhaY, coluna] = sinTheta;
                    }
                    else // no.Id == barra.IdNoFinal
                    {
                        A[linhaX, coluna] = -cosTheta;
                        A[linhaY, coluna] = -sinTheta;
                    }
                }
            }
        }

        private ResultadoTrelica FormatarResultados(Vector<double> x)
        {
            var resultado = new ResultadoTrelica();

            // Recupera as Forças nas Barras (vêm das primeiras colunas do vetor x)
            foreach (var (idBarra, indiceColuna) in _idBarraParaColunaMatriz)
            {
                resultado.ForcasBarras.Add(new ResultadoBarra
                {
                    IdBarra = idBarra,
                    Forca = x[indiceColuna] // Valor positivo = Tração, Negativo = Compressão
                });
            }

            // Recupera as Reações de Apoio (vêm das colunas seguintes)
            foreach (var (idReacao, indiceColuna) in _idReacaoParaColunaMatriz)
            {
                // Parser simples para extrair ID e Direção da string de chave (ex: "R1x")
                int idNo = int.Parse(idReacao[1..^1]);
                char direcao = idReacao.Last();

                var reacao = resultado.ReacoesApoio.FirstOrDefault(r => r.IdNo == idNo);
                if (reacao == null)
                {
                    reacao = new ResultadoReacao { IdNo = idNo };
                    resultado.ReacoesApoio.Add(reacao);
                }

                if (direcao == 'x')
                    reacao.Rx = x[indiceColuna];
                else
                    reacao.Ry = x[indiceColuna];
            }
            return resultado;
        }
    }
}