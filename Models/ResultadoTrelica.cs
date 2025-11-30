using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace TrussSolverMVC.Models
{
    // Antigo: TrussResult
    public class ResultadoTrelica
    {
        public List<ResultadoBarra> ForcasBarras { get; set; } = new List<ResultadoBarra>(); // Antigo: MemberForces
        public List<ResultadoReacao> ReacoesApoio { get; set; } = new List<ResultadoReacao>(); // Antigo: ReactionForces
    }

    // Antigo: MemberResult
    public class ResultadoBarra
    {
        [Display(Name = "ID da Barra")]
        public int IdBarra { get; set; } // Antigo: MemberId

        [Display(Name = "Força")]
        public double Forca { get; set; } // Antigo: Force (Evitei 'ç' no nome da variável por convenção, mas pode usar se quiser)
        
        // Antigo: Type
        [Display(Name = "Estado")]
        public string Tipo 
        {
            get
            {
                // Lógica ajustada para a variável 'Forca'
                if (Math.Abs(Forca) < 1e-9) return "Nula (Barra Zero)";
                return Forca > 0 ? "Tração" : "Compressão";
            }
        }
    }

    // Antigo: ReactionResult
    public class ResultadoReacao
    {
        [Display(Name = "Nó")]
        public int IdNo { get; set; } // Antigo: NodeId

        [Display(Name = "Reação X")]
        public double Rx { get; set; }

        [Display(Name = "Reação Y")]
        public double Ry { get; set; }
    }
}