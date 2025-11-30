// Importa os namespaces que vamos usar
using TrussSolverMVC.Models;
using TrussSolverMVC.Services;

var builder = WebApplication.CreateBuilder(args);

// 1. Adiciona os serviços do padrão MVC
//    Configura o JSON para manter os nomes das propriedades como estão no C# (PascalCase)
builder.Services.AddControllersWithViews()
    .AddJsonOptions(options => options.JsonSerializerOptions.PropertyNamingPolicy = null);

// 2. ** INJEÇÃO DE DEPENDÊNCIA **
//    Registra nosso serviço. 
//    Isso diz ao C#: "Quando um Controller pedir um 'IServicoCalculoTrelica', 
//    entregue uma nova instância da classe 'ServicoCalculoTrelica'".
builder.Services.AddScoped<IServicoCalculoTrelica, ServicoCalculoTrelica>();

var app = builder.Build();

// Configura o pipeline de requisições HTTP
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Calculadora/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles(); // Para servir arquivos JS e CSS

app.UseRouting();

app.UseAuthorization();

// Define a rota padrão: /Calculadora/Index
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Calculadora}/{action=Index}/{id?}");

app.Run();