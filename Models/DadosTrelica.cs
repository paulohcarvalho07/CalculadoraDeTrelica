using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace TrussSolverMVC.Models
{
    // Antigo: TrussInput
    public class DadosTrelica
    {
        public List<No> Nos { get; set; } = new List<No>();
        public List<Barra> Barras { get; set; } = new List<Barra>();
        public List<Apoio> Apoios { get; set; } = new List<Apoio>();
        public List<Carga> Cargas { get; set; } = new List<Carga>();
    }

    // Antigo: Node
    public class No
    {
        public int Id { get; set; }
        
        [Display(Name = "Coordenada X")]
        public double X { get; set; }

        [Display(Name = "Coordenada Y")]
        public double Y { get; set; }
    }

    // Antigo: Member
    public class Barra
    {
        public int Id { get; set; }

        [Display(Name = "Nó Inicial")]
        public int IdNoInicial { get; set; } // Antigo: StartNodeId

        [Display(Name = "Nó Final")]
        public int IdNoFinal { get; set; }   // Antigo: EndNodeId
    }

    // Antigo: SupportType
    public enum TipoApoio
    { 
        [Display(Name = "Apoio Fixo (Pino)")]
        Pino,    // Antigo: Pinned

        [Display(Name = "Rolete em X")]
        RoleteX, // Antigo: RollerX

        [Display(Name = "Rolete em Y")]
        RoleteY  // Antigo: RollerY
    }

    // Antigo: Support
    public class Apoio
    {
        [Display(Name = "ID do Nó")]
        public int IdNo { get; set; } // Antigo: NodeId

        [Display(Name = "Tipo de Apoio")]
        public TipoApoio Tipo { get; set; } // Antigo: Type
    }

    // Antigo: Load
    public class Carga
    {
        [Display(Name = "ID do Nó")]
        public int IdNo { get; set; } // Antigo: NodeId

        [Display(Name = "Força em X (Fx)")]
        public double Fx { get; set; } 

        [Display(Name = "Força em Y (Fy)")]
        public double Fy { get; set; } 
    }
}