using Microsoft.AspNetCore.Mvc;

namespace FileExplorerApp.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class FileExplorerController : ControllerBase
    {
        private readonly ILogger<FileExplorerController> _logger;
        private readonly string _homeDirectory;

        public FileExplorerController(ILogger<FileExplorerController> logger, IConfiguration config)
        {
            _logger = logger;
            _homeDirectory = config["HomeDirectory"] ?? "/Users/zernab/Documents";
        }

        [HttpGet("{*path}")]
        public IActionResult Get(string? path)
        {
            var fullPath = Path.GetFullPath(Path.Combine(_homeDirectory, path ?? string.Empty));

            // don't allow access outside defined home directory
            if (!fullPath.StartsWith(Path.GetFullPath(_homeDirectory)))
                return BadRequest("Access denied.");

            if (!Directory.Exists(fullPath))
                return NotFound("Directory not found");

            var directories = Directory.GetDirectories(fullPath).Select(dir => new
            {
                Name = Path.GetFileName(dir)
            });

            var files = Directory.GetFiles(fullPath).Select(file =>
            {
                var info = new FileInfo(file);
                return new
                {
                    info.Name,
                    Size = info.Length
                };
            }).ToList();

            return Ok(new
            {
                Path = path ?? "/",
                Directories = directories,
                Files = files,
                FileCount = files.Count,
                FolderCount = directories.Count(),
                TotalSizeBytes = files.Sum(f => f.Size)
            });
        }
    }
}
