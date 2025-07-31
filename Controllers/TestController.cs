using Microsoft.AspNetCore.Mvc;
using System.IO;

namespace FileExplorerApp.Controllers {
    [ApiController]
    [Route("api/[controller]")]
    public class FileExplorerController : ControllerBase {

        private readonly ILogger<FileExplorerController> _logger;
        private readonly string _rootDirectory = "/Users/zernab/Documents"; // change to a root directory on your computer

        public FileExplorerController(ILogger<FileExplorerController> logger) {
            _logger = logger;
        }

        [HttpGet("{*path}")] // Accepts subpaths like /api/fileexplorer/subdir
        public IActionResult Get(string? path) {
            var fullPath = Path.Combine(_rootDirectory, path ?? string.Empty);
            if (!Directory.Exists(fullPath)) return NotFound("Directory not found");

            var directories = Directory.GetDirectories(fullPath).Select(Path.GetFileName);
            var files = Directory.GetFiles(fullPath).Select(file => new {
                Name = Path.GetFileName(file),
                Size = new FileInfo(file).Length
            });

            return Ok(new {
                Path = path ?? "/",
                Directories = directories,
                Files = files
            });
        }
    }
}
