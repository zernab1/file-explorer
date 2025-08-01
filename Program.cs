namespace FileExplorerApp {
    public class Program {
        public static void Main(string[] args) {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.

            builder.Services.AddControllers();

            builder.Services.AddDirectoryBrowser();

            var app = builder.Build();

            // Configure the HTTP request pipeline.

            app.UseDefaultFiles(); // allows "/" to redirect to index.html

            app.UseHttpsRedirection();

            app.UseStaticFiles();
            
            app.UseRouting(); // also adding this middleware to allow for "/" root usage instead of /index.html

            app.MapControllers();

            app.Run();
        }
    }
}