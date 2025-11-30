using Microsoft.AspNetCore.Mvc;
using TrussSolverMVC.Models;
using TrussSolverMVC.Services;

namespace TrussSolverMVC.Controllers
{
    public class CalculadoraController : Controller
    {
        // Variável privada para guardar o serviço
        private readonly IServicoCalculoTrelica _servicoCalculo;

        // Construtor: Pede ao C# para "injetar" o serviço que registramos no Program.cs
        public CalculadoraController(IServicoCalculoTrelica servicoCalculo)
        {
            _servicoCalculo = servicoCalculo;
        }

        // Ação [GET] /Calculadora/Index
        // Esta ação serve a página de desenho (o .cshtml)
        [HttpGet]
        public IActionResult Index()
        {
            return View(); // Retorna o arquivo Views/Calculadora/Index.cshtml
        }



        // Ação [POST] /Calculadora/Calcular
        // Esta é a nossa "API" que o JavaScript vai chamar
        [HttpPost]
        public IActionResult Calcular([FromBody] DadosTrelica dados)
        {
            try
            {
                // Chama o serviço para fazer o trabalho pesado
                var resultados = _servicoCalculo.Calcular(dados);
                return Json(resultados); // Retorna os resultados como JSON
            }
            catch (Exception ex)
            {
                // Se der erro (ex: treliça instável), retorna um erro 400
                return BadRequest(new { mensagem = ex.Message });
            }
        }
    }
}
