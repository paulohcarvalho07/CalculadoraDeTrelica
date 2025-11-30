using TrussSolverMVC.Models;

namespace TrussSolverMVC.Services
{
    public interface IServicoCalculoTrelica
    {
        ResultadoTrelica Calcular(DadosTrelica dados);
    }
}
