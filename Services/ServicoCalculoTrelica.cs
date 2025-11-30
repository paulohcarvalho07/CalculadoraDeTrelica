using MathNet.Numerics.LinearAlgebra;
using TrussSolverMVC.Models;

namespace TrussSolverMVC.Services
{
    public class ServicoCalculoTrelica : IServicoCalculoTrelica
    {
        // Mapas para rastrear qual incógnita (Força, Reação) vai em qual coluna da matriz
        private readonly Dictionary<int, int> _idBarraParaColunaMatriz = new();
        private readonly Dictionary<string, int> _idReacaoParaColunaMatriz = new();
        private int _numReacoes;

        public ResultadoTrelica Calcular(DadosTrelica dados)
        {
            // 1. Mapear todas as incógnitas (quantas são e onde estão)
            MapearIncognitas(dados);

            int numNos = dados.Nos.Count;
            int numBarras = dados.Barras.Count;

            int numEquacoes = 2 * numNos; // 2 equações (Fx=0, Fy=0) por nó
            int numIncognitas = numBarras + _numReacoes; // Incógnitas = Forças nas barras + Reações

            // 2. Verificar se a treliça é estaticamente determinada
            if (numEquacoes != numIncognitas)
            {
                throw new InvalidOperationException($"Treliça estaticamente indeterminada ou instável. Equações: {numEquacoes}, Incógnitas: {numIncognitas}");
            }

            // 3. Criar a Matriz A e o Vetor B do sistema A.x = B
            var A = Matrix<double>.Build.Dense(numEquacoes, numIncognitas);
            var B = Vector<double>.Build.Dense(numEquacoes);
            var mapaNos = dados.Nos.ToDictionary(n => n.Id);

            // 4. Montar a matriz A e o vetor B
            MontarMatrizes(dados, mapaNos, A, B);

            // 5. ** A MÁGICA DA ÁLGEBRA LINEAR **
            // Verifica se a matriz é singular (determinante zero ou muito próximo)
            // Isso indica que a estrutura é instável (mecanismo)
            if (Math.Abs(A.Determinant()) < 1e-9)
            {
                throw new InvalidOperationException("A estrutura é instável (Matriz Singular). Verifique se há apoios suficientes e se a geometria não forma um mecanismo móvel.");
            }

            // Resolve o sistema A.x = B para encontrar o vetor de incógnitas x
            var x = A.Solve(B); // x é um vetor com todas as forças

            // 6. Formatar os resultados
            return FormatarResultados(x);
        }

        private void MapearIncognitas(DadosTrelica dados)
        {
            _idBarraParaColunaMatriz.Clear();
            _idReacaoParaColunaMatriz.Clear();
            _numReacoes = 0;
            int colunaAtual = 0;

            // Mapeia cada barra para uma coluna da matriz
            foreach (var barra in dados.Barras)
            {
                _idBarraParaColunaMatriz[barra.Id] = colunaAtual++;
            }

            // Mapeia cada reação de apoio para uma coluna da matriz
            foreach (var apoio in dados.Apoios)
            {
                if (apoio.Tipo == TipoApoio.Pino)
                {
                    _idReacaoParaColunaMatriz[$"R{apoio.IdNo}x"] = colunaAtual++;
                    _idReacaoParaColunaMatriz[$"R{apoio.IdNo}y"] = colunaAtual++;
                    _numReacoes += 2;
                }
                else if (apoio.Tipo == TipoApoio.RoleteY)
                {
                    _idReacaoParaColunaMatriz[$"R{apoio.IdNo}y"] = colunaAtual++;
                    _numReacoes += 1;
                }
                else if (apoio.Tipo == TipoApoio.RoleteX)
                {
                    _idReacaoParaColunaMatriz[$"R{apoio.IdNo}x"] = colunaAtual++;
                    _numReacoes += 1;
                }
            }
        }

        private void MontarMatrizes(DadosTrelica dados, Dictionary<int, No> mapaNos, Matrix<double> A, Vector<double> B)
        {
            // Loop principal: Monta a matriz A e o vetor B nó por nó
            foreach (var no in dados.Nos)
            {
                // Cada nó tem duas equações (duas linhas na matriz)
                int linhaX = no.Id * 2;
                int linhaY = no.Id * 2 + 1;

                // 1. Adiciona FORÇAS EXTERNAS (Cargas) ao Vetor B
                var carga = dados.Cargas.FirstOrDefault(c => c.IdNo == no.Id);
                if (carga != null)
                {
                    // A equação é ΣF = 0 => Σ(Internas) + Σ(Externas) = 0
                    // Logo: Σ(Internas) = -Σ(Externas)
                    B[linhaX] = -carga.Fx;
                    B[linhaY] = -carga.Fy;
                }

                // 2. Adiciona REAÇÕES DE APOIO à Matriz A
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

                // 3. Adiciona FORÇAS DAS BARRAS (Membros) à Matriz A
                var barrasConectadas = dados.Barras.Where(b => b.IdNoInicial == no.Id || b.IdNoFinal == no.Id);
                foreach (var barra in barrasConectadas)
                {
                    var noInicial = mapaNos[barra.IdNoInicial];
                    var noFinal = mapaNos[barra.IdNoFinal];

                    // Calcula o cosseno e seno diretores da barra
                    double dx = noFinal.X - noInicial.X;
                    double dy = noFinal.Y - noInicial.Y;
                    double comprimento = Math.Sqrt(dx * dx + dy * dy);
                    double cosTheta = dx / comprimento;
                    double sinTheta = dy / comprimento;

                    int coluna = _idBarraParaColunaMatriz[barra.Id]; // Coluna desta barra

                    // Se estamos no nó inicial, a força age (cos, sin)
                    // Se estamos no nó final, a força age (-cos, -sin)
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

            // Mapeia o vetor 'x' de volta para as Forças das Barras
            foreach (var (idBarra, indiceColuna) in _idBarraParaColunaMatriz)
            {
                resultado.ForcasBarras.Add(new ResultadoBarra
                {
                    IdBarra = idBarra,
                    Forca = x[indiceColuna]
                });
            }

            // Mapeia o vetor 'x' de volta para as Forças de Reação
            foreach (var (idReacao, indiceColuna) in _idReacaoParaColunaMatriz)
            {
                int idNo = int.Parse(idReacao[1..^1]); // Pega o '1' de "R1y"
                char direcao = idReacao.Last(); // Pega o 'y'

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
