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

        public FileExplorerController(ILogger<FileExplorerController> logger, IConfiguration config)
        {
            _logger = logger;
            _homeDirectory = Path.GetFullPath(config["HomeDirectory"]);
        }

        [HttpGet("search")]
        public IActionResult Search(string q)
        {
            if (string.IsNullOrWhiteSpace(q))
                return BadRequest("Query can't be empty!");

            try
            {
                var directories = Directory.EnumerateDirectories(_homeDirectory, "*", SearchOption.AllDirectories)
                    .Where(d => Path.GetFileName(d).Contains(q, StringComparison.OrdinalIgnoreCase))
                    .Select(d => new
                    {
                        name = Path.GetFileName(d),
                        path = d,
                        size = (long?)null,
                        type = "Folder"
                    });

                var files = Directory.EnumerateFiles(_homeDirectory, "*", SearchOption.AllDirectories)
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

                var results = directories.Concat(files).Take(100).ToList(); // combined files and directories that match search

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

        [HttpGet("{*path}")]
        public IActionResult Get(string? path)
        {
            var fullPath = Path.GetFullPath(Path.Combine(_homeDirectory, path ?? string.Empty));

            if (!Directory.Exists(fullPath))
                return NotFound("Directory not found!");

            var directories = Directory.GetDirectories(fullPath).Select(dir => new
            {
                name = Path.GetFileName(dir) // names of all immediate subdirectories
            });

            var files = Directory.GetFiles(fullPath).Select(file =>
            {
                var info = new FileInfo(file);
                return new
                {
                    name = info.Name,
                    size = info.Length
                };
            }).ToList(); // names and sizes of all immediate files

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
            var fullPath = Path.GetFullPath(Path.Combine(_homeDirectory, path ?? string.Empty));

            if (!System.IO.File.Exists(fullPath))
                return NotFound();

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(fullPath, out var contentType))
            {
                contentType = "application/octet-stream"; // fallback to arbitrary binary data
            }

            var fileName = Path.GetFileName(fullPath);
            return PhysicalFile(fullPath, contentType, fileName);
        }

        // Used for safety check prior to file uploads
        [HttpGet("exists")]
        public IActionResult FileExists(string path, string filename)
        {
            if (string.IsNullOrWhiteSpace(path) || string.IsNullOrWhiteSpace(filename))
                return BadRequest("Invalid path/filename.");

            var fullPath = Path.GetFullPath(Path.Combine(_homeDirectory, path, filename));

            bool exists = System.IO.File.Exists(fullPath);
            return Ok(new { exists });
        }

        [HttpPost("upload")]
        public async Task<IActionResult> Upload([FromForm] string path, [FromForm] IFormFile file)
        {
            var fullPath = Path.GetFullPath(Path.Combine(_homeDirectory, path ?? string.Empty));

            if (!Directory.Exists(fullPath))
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
            var fullPath = Path.GetFullPath(Path.Combine(_homeDirectory, path ?? string.Empty));

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
            var sourceFullPath = Path.GetFullPath(Path.Combine(_homeDirectory, sourcePath));
            var destinationFullPath = Path.GetFullPath(Path.Combine(_homeDirectory, destinationPath, Path.GetFileName(sourceFullPath)));

            if (Directory.Exists(sourceFullPath) &&
                destinationFullPath.StartsWith(sourceFullPath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest("Can't move a folder into itself or its own subfolder!");
            }

            if (System.IO.File.Exists(sourceFullPath))
            {
                System.IO.File.Move(sourceFullPath, destinationFullPath, overwrite: true); // TODO: ask user if they want to overwrite with file being moved
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
            var sourceFullPath = Path.GetFullPath(Path.Combine(_homeDirectory, sourcePath));
            var destinationFullPath = Path.GetFullPath(Path.Combine(_homeDirectory, destinationPath, Path.GetFileName(sourceFullPath)));

            if (Directory.Exists(sourceFullPath) &&
                destinationFullPath.StartsWith(sourceFullPath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest("Can't' copy a folder into itself or its own subfolder.");
            }

            if (System.IO.File.Exists(sourceFullPath))
            {
                System.IO.File.Copy(sourceFullPath, destinationFullPath, overwrite: true); // TODO: ask user if they want to overwrite with file being copied
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
