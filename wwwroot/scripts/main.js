/// Constant and Global variables ///
let currentPath = "/";
let itemToMove, itemToCopy, selectedItemPath = null;

const Icons = {
    folder: "📂",
    file: "📄",
    download: "📥",
    upload: "📤",
    back: "👈",
    search: "🔎"
};

/// Util Functions ///
function formatBytes(bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 Bytes";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function clearModalSelection() {
    $(".selected-folder").removeClass("selected");
    $("#confirm-modal").prop("disabled", true).removeData("destPath");
}

function clearAllSelection() {
    clearModalSelection();
    $(".item").removeClass("selected");
    selectedItemPath = null;
}

function joinPaths(a, b) {
    return `${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}`;
}

function sanitizePath(path) {
    return path.replace(/^\/+/, '');
}

function highlightSelection($element, path) {
    $('.item, .selected-folder').removeClass('selected');
    $element.addClass('selected');
    selectedItemPath = path;
}

/// Search Functionality ///
function searchDirectory(query) {
    if (!query.trim()) return;

    $.getJSON(`/api/fileexplorer/search?q=${encodeURIComponent(query)}`, function (data) {
        const $contents = $("#contents").empty();
        $("#path").text(`Search Results for "${data.query}" (${data.resultCount})`);

        if (data.resultCount === 0) {
            $contents.append("<div>No matching files or folders found.</div>");
            return;
        }

        const folders = data.results.filter(x => x.type === "Folder");
        const files = data.results.filter(x => x.type === "File");

        if (folders.length) {
            $("<div>").text(`${Icons.folder} Folders:`).css("margin-top", "1rem").appendTo($contents);
            folders.forEach(dir => {
                const $row = $("<div>").addClass("item folder selected-folder").text(`${Icons.folder} ${dir.name}`);
                $row.on("click", () => {
                    history.pushState({ path: dir.path }, "", `/?path=${encodeURIComponent(dir.path)}`);
                    loadDirectory(dir.path);
                });
                $row.appendTo($contents);
            });
        }

        if (files.length) {
            $("<div>").text(`📄 Files:`).css("margin-top", "1rem").appendTo($contents);
            files.forEach(file => {
                const $row = $("<div>").addClass("item file").text(`${Icons.file} ${file.name} (${formatBytes(file.size)})`);
                $row.on("click", () => {
                    highlightSelection($row, file.path);
                });
                $row.appendTo($contents);
            });
        }
    });
}

/// Directory Rendering ///
function loadDirectory(path = "") {
    currentPath = path || "/";
    const url = joinPaths("/api/fileexplorer", path === "/" ? "" : path);
    $.getJSON(url, function (data) {
        $("#path").text(`Path: ${data.path}`);

        const $contents = $("#contents").empty();

        $("<div>")
            .css("margin-bottom", "1rem")
            .text(`${Icons.file} ${data.fileCount} files, ${Icons.folder} ${data.folderCount} folders, ${formatBytes(data.totalSizeBytes)} total`)
            .appendTo($contents);

        renderBreadcrumbs(path);
        renderFolders(data.directories, path, $contents);
        renderFiles(data.files, path, $contents);
    }).fail(() => {
        $("#contents").html("<div>Error rendering directory.</div>");
    });
}

function renderFolders(folders, path, $container) {
    folders.forEach(dir => {
        const fullPath = joinPaths(path, dir.name);

        const $folderRow = $("<div>").addClass("item folder selected-folder");

        const $folderLabel = $("<div>")
            .addClass("folder-label")
            .text(`${Icons.folder} ${dir.name}`)
            .on("click", () => {
                const newPath = joinPaths(path, dir.name);
                history.pushState({ path: newPath }, "", `/?path=${encodeURIComponent(newPath)}`);
                currentPath = newPath;
                loadDirectory(newPath);
            });

        const $deleteBtn = $("<button>")
            .addClass("btn-delete")
            .text("Delete")
            .on("click", (e) => {
                e.stopPropagation();
                highlightSelection($folderRow, fullPath);
                if (confirm(`Delete folder "${dir.name}" and all its contents?`)) {
                    deleteItem(fullPath);
                }
            });

        const $moveBtn = $("<button>")
            .addClass("btn-move")
            .text("Move")
            .on("click", (e) => {
                e.stopPropagation();
                highlightSelection($folderRow, fullPath);
                openMoveModal(fullPath);
            });

        const $copyBtn = $("<button>")
            .addClass("btn-copy")
            .text("Copy")
            .on("click", (e) => {
                e.stopPropagation();
                highlightSelection($folderRow, fullPath);
                openCopyModal(fullPath);
            });

        $folderRow
            .append($folderLabel, $deleteBtn, $moveBtn, $copyBtn)
            .appendTo($container);
    });
}

function renderFiles(files, path, $container) {
    files.forEach(file => {
        const fullPath = joinPaths(path, file.name);

        const $fileRow = $("<div>").addClass("item file");

        const $fileLabel = $("<div>")
            .addClass("file-label")
            .text(`${Icons.file} ${file.name} (${formatBytes(file.size)})`);

        const $buttonGroup = $("<div>").addClass("button-group");

        const $deleteBtn = $("<button>")
            .addClass("btn-delete")
            .text("Delete")
            .on("click", (e) => {
                e.stopPropagation();
                highlightSelection($fileRow, fullPath);
                if (confirm(`Delete file "${file.name}"?`)) {
                    deleteItem(fullPath);
                }
            });

        const $downloadBtn = $("<button>")
            .addClass("btn-download")
            .text("Download")
            .on("click", () => {
                window.location.href = `/api/fileexplorer/download?path=${encodeURIComponent(fullPath)}`;
            });

        const $moveBtn = $("<button>")
            .addClass("btn-move")
            .text("Move")
            .on("click", (e) => {
                e.stopPropagation();
                highlightSelection($fileRow, fullPath);
                openMoveModal(fullPath);
            });

        const $copyBtn = $("<button>")
            .addClass("btn-copy")
            .text("Copy")
            .on("click", (e) => {
                e.stopPropagation();
                highlightSelection($fileRow, fullPath);
                openCopyModal(fullPath);
            });

        $buttonGroup.append($deleteBtn, $downloadBtn, $moveBtn, $copyBtn);
        $fileRow.append($fileLabel, $buttonGroup).appendTo($container);
    });
}



function renderBreadcrumbs(path) {
    path = path.replace(/^\/|\/$/g, "");
    const $pathDiv = $("#path").empty();

    $("<span>")
        .addClass("breadcrumb")
        .css("cursor", "pointer")
        .text("Home")
        .on("click", () => {
            history.pushState({ path: "/" }, "", "/");
            loadDirectory("/");
        }).appendTo($pathDiv);

    if (path) {
        const parts = path.split("/");
        parts.forEach((part, idx) => {
            const partPath = parts.slice(0, idx + 1).join("/");
            $pathDiv.append(" > ");
            $("<span>")
                .addClass("breadcrumb")
                .css("cursor", "pointer")
                .text(part)
                .on("click", () => {
                    history.pushState({ path: partPath }, "", `/?path=${encodeURIComponent(partPath)}`);
                    loadDirectory(partPath);
                }).appendTo($pathDiv);
        });
    }
}

/// Deletion ///
function deleteItem(path) {
    $.ajax({
        url: `/api/fileexplorer/delete?path=${encodeURIComponent(path)}`,
        type: "DELETE",
        success: () => loadDirectory(currentPath),
        error: (xhr) => alert("Delete failed: " + xhr.responseText)
    });
}

/// File Uploads ///
$('#upload-form').on('submit', function (e) {
    e.preventDefault();

    const fileInput = $('#file-input')[0];
    const warning = $('#upload-warning');
    warning.text("");

    if (fileInput.files.length === 0) {
        warning.text("Please select a file before attempting to upload.");
        return;
    }

    const file = fileInput.files[0];
    const fileName = file.name;
    let uploadPath = currentPath === "/" ? "." : currentPath;

    // Does file being uploaded already exist?
    $.get('/api/fileexplorer/exists', { path: uploadPath, filename: fileName }, function (response) {
        if (response.exists) {
            if (!confirm(`"${fileName}" already exists. Replace it?`)) {
                return;
            }
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', uploadPath);

        $.ajax({
            url: '/api/fileexplorer/upload',
            type: 'POST',
            data: formData,
            contentType: false,
            processData: false,
            success: () => {
                alert('Upload successful!');
                loadDirectory(currentPath);
            },
            error: (xhr) => alert('Upload failed: ' + xhr.responseText)
        });
    });
});

/// Move Functionality ///
function openMoveModal(sourcePath) {
    itemToMove = sourcePath;
    clearModalSelection();
    $("#directory-modal").show();
    loadDestinationBrowser("/");
}

/// Copy Functionality ///
function openCopyModal(sourcePath) {
    itemToCopy = sourcePath;
    clearModalSelection();
    $("#directory-modal").show();
    loadDestinationBrowser("/");
}

function performCopyOrMove() {
    const destPath = $("#confirm-modal").data("destPath");
    if (itemToCopy) {
        $.post(`/api/fileexplorer/move?sourcePath=${encodeURIComponent(sanitizePath(itemToCopy))}&destinationPath=${encodeURIComponent(sanitizePath(destPath))}`)
            .done(() => {
                alert("Successfully Copied!");
                resetDirectoryModal();
                loadDirectory(currentPath);
            })
            .fail((xhr) => {
                alert("Copy failed: " + xhr.responseText);
            });
    } else if (itemToMove) {
        $.post(`/api/fileexplorer/move?sourcePath=${encodeURIComponent(sanitizePath(itemToMove))}&destinationPath=${encodeURIComponent(sanitizePath(destPath))}`)
            .done(() => {
                alert("Successfully Moved!");
                resetDirectoryModal();
                loadDirectory(currentPath);
            })
            .fail((xhr) => {
                alert("Move failed: " + xhr.responseText);
            });
    }
}

function resetDirectoryModal() {
    $("#directory-modal").hide();
    itemToMove = null;
    itemToCopy = null;
    clearAllSelection();
}

function loadDestinationBrowser(path) {
    $.getJSON(`/api/fileexplorer/${path === "/" ? "" : path}`, function (data) {
        const $browser = $("#destination-browser").empty();
        $("<div>").text(`Current: ${path}`).css({ fontWeight: "bold", marginBottom: "0.5rem" }).appendTo($browser);

        if (path !== "/") {
            const parentPath = path.split("/").slice(0, -1).join("/") || "/";
            $("<div>")
                .text(`${Icons.back} Back`)
                .css("cursor", "pointer")
                .on("click", () => {
                    clearModalSelection();
                    loadDestinationBrowser(parentPath);
                }).appendTo($browser);
        }

        data.directories.forEach(dir => {
            const newPath = path === "/" ? dir.name : `${path}/${dir.name}`;

            $("<div>")
                .addClass("selected-folder")
                .text(`${Icons.folder} ${dir.name}`)
                .css("cursor", "pointer")
                .on("click", function () {
                    $(".selected-folder").removeClass("selected");
                    $(this).addClass("selected");
                    $("#confirm-modal").prop("disabled", false).data("destPath", newPath);
                })
                .on("dblclick", function () {
                    clearModalSelection();
                    loadDestinationBrowser(newPath);
                }).appendTo($browser);
        });
    });
}

/// Event Setup ///
$(document).ready(() => {
    const params = new URLSearchParams(window.location.search);
    const initialPath = params.get("path") || "";
    loadDirectory(initialPath);

    window.onpopstate = function (event) {
        const path = event.state?.path || "";
        loadDirectory(path);
    };

    $("#search-btn")
        .text(Icons.search)
        .attr("title", "Search")
        .on("click", () => {
            const query = $("#search-input").val().trim();
            if (query) {
                searchDirectory(query);
                $("#clear-search").show();
            }
        });

    $("#search-input").on("keypress", function (e) {
        if (e.key === "Enter") {
            $("#search-btn").click();
        }
    });

    $("#clear-search").on("click", () => {
        $("#search-input").val("");
        $("#clear-search").hide();
        loadDirectory(currentPath);
    });

    $("#cancel-modal").on("click", () => resetDirectoryModal());
    $("#confirm-modal").on("click", performCopyOrMove);
});