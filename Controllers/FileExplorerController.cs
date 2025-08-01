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

        [HttpGet("download")]
        public IActionResult Download([FromQuery] string path)
        {
            var fullPath = Path.GetFullPath(Path.Combine(_homeDirectory, path ?? string.Empty));
            if (!fullPath.StartsWith(Path.GetFullPath(_homeDirectory)) || !System.IO.File.Exists(fullPath))
                return NotFound();

            var contentType = "application/octet-stream"; // look into MIME mapping in .NET...
            var fileName = Path.GetFileName(fullPath);
            return PhysicalFile(fullPath, contentType, fileName);
        }

        [HttpPost("upload")]
        public async Task<IActionResult> Upload([FromForm] string path, [FromForm] IFormFile file)
        {
            var fullPath = Path.GetFullPath(Path.Combine(_homeDirectory, path ?? string.Empty));
            if (!fullPath.StartsWith(Path.GetFullPath(_homeDirectory)) || !Directory.Exists(fullPath))
                return BadRequest("Invalid upload path.");

            if (file == null || file.Length == 0)
                return BadRequest("No file uploaded.");

            var filePath = Path.Combine(fullPath, file.FileName);

            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            return Ok("File uploaded successfully!");
        }

        [HttpDelete("delete")]
        public IActionResult Delete([FromQuery] string path)
        {
            _logger.LogInformation($"Delete request received for path: {path}");

            var fullPath = Path.GetFullPath(Path.Combine(_homeDirectory, path ?? string.Empty));

            if (!fullPath.StartsWith(Path.GetFullPath(_homeDirectory)))
                return BadRequest("Access denied.");

            try
            {
                if (System.IO.File.Exists(fullPath))
                {
                    System.IO.File.Delete(fullPath);
                    return Ok("File deleted.");
                }
                else if (Directory.Exists(fullPath))
                {
                    Directory.Delete(fullPath, true);
                    return Ok("Directory deleted.");
                }
                else
                {
                    return NotFound("File or directory not found.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete path: " + fullPath);
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }

        }
    }
}
