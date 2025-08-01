using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;

namespace FileExplorerApp.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class FileExplorerController : ControllerBase
    {
        private readonly ILogger<FileExplorerController> _logger;
        private readonly string _homeDirectory;
        private readonly string _basePath;

        public FileExplorerController(ILogger<FileExplorerController> logger, IConfiguration config)
        {
            _logger = logger;
            _homeDirectory = config["HomeDirectory"];
            _basePath = Path.GetFullPath(_homeDirectory);
        }

        private bool IsSafePath(string fullPath)
        {
            return fullPath.StartsWith(_basePath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                || string.Equals(fullPath, _basePath, StringComparison.OrdinalIgnoreCase);
        }

        [HttpGet("search")]
        public IActionResult Search(string q)
        {
            if (string.IsNullOrWhiteSpace(q))
                return BadRequest("Query can't be empty!");

            try
            {
                var directories = Directory.EnumerateDirectories(_basePath, "*", SearchOption.AllDirectories)
                    .Where(d => Path.GetFileName(d).Contains(q, StringComparison.OrdinalIgnoreCase))
                    .Select(d => new
                    {
                        name = Path.GetFileName(d),
                        path = d,
                        size = (long?)null,
                        type = "Folder"
                    });

                var files = Directory.EnumerateFiles(_basePath, "*", SearchOption.AllDirectories)
                    .Where(f => Path.GetFileName(f).Contains(q, StringComparison.OrdinalIgnoreCase))
                    .Select(f =>
                    {
                        var info = new FileInfo(f);
                        return new
                        {
                            name = info.Name,
                            path = f,
                            size = (long?)info.Length,
                            type = "File"
                        };
                    });

                var results = directories.Concat(files).Take(100).ToList();

                return Ok(new
                {
                    query = q,
                    resultCount = results.Count,
                    results
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Search failed!");
                return StatusCode(500, "Internal server error");
            }
        }

        [HttpGet]
        public IActionResult GetRoot()
        {
            if (!Directory.Exists(_basePath))
                return NotFound("Root directory not found!");

            var directories = Directory.GetDirectories(_basePath).Select(dir => new
            {
                name = Path.GetFileName(dir)
            });

            var files = Directory.GetFiles(_basePath).Select(file =>
            {
                var info = new FileInfo(file);
                return new
                {
                    name = info.Name,
                    size = info.Length
                };
            }).ToList();

            return Ok(new
            {
                path = "/",
                directories,
                files,
                fileCount = files.Count,
                folderCount = directories.Count(),
                totalSizeBytes = files.Sum(f => f.size)
            });
        }

        [HttpGet("{*path}")]
        public IActionResult Get(string? path)
        {
            var fullPath = Path.GetFullPath(Path.Combine(_basePath, path ?? string.Empty));

            if (!IsSafePath(fullPath))
                return BadRequest("Access Denied.");

            if (!Directory.Exists(fullPath))
                return NotFound("Directory not found!");

            var directories = Directory.GetDirectories(fullPath).Select(dir => new
            {
                name = Path.GetFileName(dir)
            });

            var files = Directory.GetFiles(fullPath).Select(file =>
            {
                var info = new FileInfo(file);
                return new
                {
                    name = info.Name,
                    size = info.Length
                };
            }).ToList();

            return Ok(new
            {
                path = path ?? "/",
                directories,
                files,
                fileCount = files.Count,
                folderCount = directories.Count(),
                totalSizeBytes = files.Sum(f => f.size)
            });
        }

        [HttpGet("download")]
        public IActionResult Download([FromQuery] string path)
        {
            var fullPath = Path.GetFullPath(Path.Combine(_basePath, path ?? string.Empty));

            if (!IsSafePath(fullPath) || !System.IO.File.Exists(fullPath))
                return NotFound();

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(fullPath, out var contentType))
            {
                contentType = "application/octet-stream";
            }

            var fileName = Path.GetFileName(fullPath);
            return PhysicalFile(fullPath, contentType, fileName);
        }

        [HttpGet("exists")]
        public IActionResult FileExists(string path, string filename)
        {
            if (string.IsNullOrWhiteSpace(path) || string.IsNullOrWhiteSpace(filename))
                return BadRequest("Invalid path/filename.");

            var fullPath = Path.GetFullPath(Path.Combine(_basePath, path, filename));

            if (!IsSafePath(fullPath))
                return BadRequest("Access Denied.");

            bool exists = System.IO.File.Exists(fullPath);
            return Ok(new { exists });
        }

        [HttpPost("upload")]
        public async Task<IActionResult> Upload([FromForm] string path, [FromForm] IFormFile file)
        {
            var fullPath = Path.GetFullPath(Path.Combine(_basePath, path ?? string.Empty));

            if (!IsSafePath(fullPath) || !Directory.Exists(fullPath))
                return BadRequest("Invalid upload path.");

            if (file == null || file.Length == 0)
                return BadRequest("No file was uploaded!");

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
            var fullPath = Path.GetFullPath(Path.Combine(_basePath, path ?? string.Empty));

            if (!IsSafePath(fullPath))
                return BadRequest("Access Denied.");

            try
            {
                if (System.IO.File.Exists(fullPath))
                {
                    System.IO.File.Delete(fullPath);
                    return Ok("File deleted successfully!");
                }
                else if (Directory.Exists(fullPath))
                {
                    Directory.Delete(fullPath, true);
                    return Ok("Directory deleted successfully!");
                }
                else
                {
                    return NotFound("The File or directory was not found.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete path: " + fullPath);
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        [HttpPost("move")]
        public IActionResult Move([FromQuery] string sourcePath, [FromQuery] string destinationPath)
        {
            var sourceFullPath = Path.GetFullPath(Path.Combine(_basePath, sourcePath));
            var destinationFullPath = Path.GetFullPath(Path.Combine(_basePath, destinationPath, Path.GetFileName(sourceFullPath)));

            if (!IsSafePath(sourceFullPath) || !IsSafePath(destinationFullPath))
                return BadRequest("Invalid path.");

            if (Directory.Exists(sourceFullPath) &&
                destinationFullPath.StartsWith(sourceFullPath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest("Can't move a folder into itself or its own subfolder!");
            }

            if (System.IO.File.Exists(sourceFullPath))
            {
                System.IO.File.Move(sourceFullPath, destinationFullPath, overwrite: true);
            }
            else if (Directory.Exists(sourceFullPath))
            {
                if (Directory.Exists(destinationFullPath))
                    return BadRequest("Destination folder already exists!");

                Directory.Move(sourceFullPath, destinationFullPath);
            }
            else
            {
                return NotFound("Source not found.");
            }

            return Ok();
        }

        [HttpPost("copy")]
        public IActionResult Copy([FromQuery] string sourcePath, [FromQuery] string destinationPath)
        {
            var sourceFullPath = Path.GetFullPath(Path.Combine(_basePath, sourcePath));
            var destinationDirectoryFullPath = Path.GetFullPath(Path.Combine(_basePath, destinationPath));
            var destinationFullPath = Path.Combine(destinationDirectoryFullPath, Path.GetFileName(sourceFullPath));

            if (!IsSafePath(sourceFullPath) || !IsSafePath(destinationFullPath))
                return BadRequest("Invalid path.");

            if (Directory.Exists(sourceFullPath) &&
                destinationFullPath.StartsWith(sourceFullPath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest("Can't' copy a folder into itself or its own subfolder.");
            }

            if (System.IO.File.Exists(sourceFullPath))
            {
                System.IO.File.Copy(sourceFullPath, destinationFullPath, overwrite: true);
            }
            else if (Directory.Exists(sourceFullPath))
            {
                if (Directory.Exists(destinationFullPath))
                    return BadRequest("Destination folder already exists!");

                CopyDirectoryRecursively(sourceFullPath, destinationFullPath);
            }
            else
            {
                return NotFound("Source does not exist.");
            }

            return Ok();
        }

        private void CopyDirectoryRecursively(string sourceDir, string destDir)
        {
            Directory.CreateDirectory(destDir);

            foreach (var file in Directory.GetFiles(sourceDir))
            {
                var destFile = Path.Combine(destDir, Path.GetFileName(file));
                System.IO.File.Copy(file, destFile, overwrite: true);
            }

            foreach (var dir in Directory.GetDirectories(sourceDir))
            {
                var destSubDir = Path.Combine(destDir, Path.GetFileName(dir));
                CopyDirectoryRecursively(dir, destSubDir);
            }
        }
    }
}
