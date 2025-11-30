namespace TrussSolverMVC.Models;

public class ModeloErro
{
    public string? IdRequisicao { get; set; }

    public bool MostrarIdRequisicao => !string.IsNullOrEmpty(IdRequisicao);
}
