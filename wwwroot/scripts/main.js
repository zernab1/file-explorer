(() => {
    const Icons = {
        folder: "📂",
        file: "📄",
        back: "👈",
        search: "🔎",
    };

    let currentPath = "/";
    let itemToMove = null;
    let itemToCopy = null;

    /// Utility Functions ///
    function formatBytes(bytes) {
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        if (bytes === 0) return "0 Bytes";
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    }

    function joinPaths(a, b) {
        // Normalize paths and join to prevent path issues with missing or exra slash
        let path = [a, b]
            .map((p) => p.replace(/^\/+|\/+$/g, ""))
            .filter(Boolean)
            .join("/");
        return path || ".";
    }

    function sanitizePath(path) {
        return path.replace(/^\/+/, "");
    }

    function clearModalSelection() {
        $(".selected-folder").removeClass("selected");
        $("#confirm-modal").prop("disabled", true).removeData("destPath");
    }

    function clearAllSelection() {
        clearModalSelection();
        $(".item").removeClass("selected");
    }

    function highlightSelection($el, path) {
        $(".item, .selected-folder").removeClass("selected");
        $el.addClass("selected");
    }

    /// Search ///
    function searchDirectory(query) {
        if (!query.trim()) return;

        $.getJSON(`/api/fileexplorer/search?q=${encodeURIComponent(query)}`, (data) => {
            const $contents = $("#contents").empty();
            $("#path").text(`Search Results for "${data.query}" (${data.resultCount})`);

            if (data.resultCount === 0) {
                $contents.append("<div>No matching files or folders found.</div>");
                return;
            }

            const folders = data.results.filter((x) => x.type === "Folder");
            const files = data.results.filter((x) => x.type === "File");

            if (folders.length) {
                $("<div>")
                    .text(`${Icons.folder} Folders:`)
                    .appendTo($contents);

                folders.forEach((dir) => {
                    const $row = $("<div>")
                        .addClass("item folder selected-folder")
                        .text(`${Icons.folder} ${dir.name}`)
                        .on("click", () => {
                            history.pushState({ path: dir.path }, "", `/?path=${encodeURIComponent(dir.path)}`);
                            loadDirectory(dir.path);
                        });
                    $row.appendTo($contents);
                });
            }

            if (files.length) {
                $("<div>")
                    .text(`${Icons.file} Files:`)
                    .appendTo($contents);

                files.forEach((file) => {
                    const $row = $("<div>")
                        .addClass("item file")
                        .text(`${Icons.file} ${file.name} (${formatBytes(file.size)})`)
                        .on("click", () => {
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
        $.getJSON(url)
            .done((data) => {
                $("#path").text(`Path: ${data.path}`);

                const $contents = $("#contents").empty();

                $("<div>")
                    .text(
                        `${Icons.file} ${data.fileCount} files, ${Icons.folder} ${data.folderCount} folders, ${formatBytes(
                            data.totalSizeBytes
                        )} total`
                    )
                    .appendTo($contents);

                renderBreadcrumbs(path);
                renderFolders(data.directories, path, $contents);
                renderFiles(data.files, path, $contents);
            })
            .fail(() => {
                $("#contents").html("<div>Error rendering directory.</div>");
            });
    }

    function renderFolders(folders, basePath, $container) {
        folders.forEach((dir) => {
            const fullPath = joinPaths(basePath, dir.name);
            const $folderRow = $("<div>").addClass("item folder selected-folder");

            const $folderLabel = $("<div>")
                .addClass("item folder selected-folder").attr("data-path", fullPath)
                .text(`${Icons.folder} ${dir.name}`)
                .on("click", () => {
                    const newPath = joinPaths(basePath, dir.name);
                    history.pushState({ path: newPath }, "", `/?path=${encodeURIComponent(newPath)}`);
                    currentPath = newPath;
                    loadDirectory(newPath);
                });

            const $deleteBtn = createButton("btn-delete", "Delete", () => {
                if (confirm(`Delete folder "${dir.name}" and all its contents?`)) {
                    deleteItem(fullPath);
                }
            }, $folderRow);

            const $moveBtn = createButton("btn-move", "Move", () => openMoveModal(fullPath), $folderRow);
            const $copyBtn = createButton("btn-copy", "Copy", () => openCopyModal(fullPath), $folderRow);

            $folderRow.append($folderLabel, $deleteBtn, $moveBtn, $copyBtn).appendTo($container);
        });
    }

    function renderFiles(files, basePath, $container) {
        files.forEach((file) => {
            const fullPath = joinPaths(basePath, file.name);
            const $fileRow = $("<div>").addClass("item file").attr("data-path", fullPath);

            const $fileLabel = $("<div>")
                .text(`${Icons.file} ${file.name} (${formatBytes(file.size)})`);

            const $buttonGroup = $("<div>").addClass("button-group");

            const $deleteBtn = createButton("btn-delete", "Delete", () => {
                if (confirm(`Delete file "${file.name}"?`)) {
                    deleteItem(fullPath);
                }
            }, $fileRow);

            const $downloadBtn = createButton("btn-download", "Download", () => {
                window.location.href = `/api/fileexplorer/download?path=${encodeURIComponent(fullPath)}`;
            });

            const $moveBtn = createButton("btn-move", "Move", () => openMoveModal(fullPath), $fileRow);
            const $copyBtn = createButton("btn-copy", "Copy", () => openCopyModal(fullPath), $fileRow);

            $buttonGroup.append($deleteBtn, $downloadBtn, $moveBtn, $copyBtn);
            $fileRow.append($fileLabel, $buttonGroup).appendTo($container);
        });
    }

    function createButton(className, text, onClick, $parent) {
        return $("<button>")
            .addClass(className)
            .text(text)
            .on("click", (e) => {
                if ($parent) e.stopPropagation();
                onClick();
            });
    }

    /// Breadcrumbs ///
    function renderBreadcrumbs(path) {
        sanitizePath(path)
        const $pathDiv = $("#path").empty();

        $("<span>")
            .addClass("breadcrumb")
            .css("cursor", "pointer")
            .text("Home")
            .on("click", () => {
                history.pushState({ path: "/" }, "", "/");
                loadDirectory("/");
            })
            .appendTo($pathDiv);

        if (path) {
            const parts = path.split("/");
            parts.forEach((part, index) => {
                const partPath = parts.slice(0, index + 1).join("/");
                $pathDiv.append(" > ");
                $("<span>")
                    .addClass("breadcrumb")
                    .css("cursor", "pointer")
                    .text(part)
                    .on("click", () => {
                        history.pushState({ path: partPath }, "", `/?path=${encodeURIComponent(partPath)}`);
                        loadDirectory(partPath);
                    })
                    .appendTo($pathDiv);
            });
        }
    }

    /// Delete ///
    function deleteItem(path) {
        $.ajax({
            url: `/api/fileexplorer/delete?path=${encodeURIComponent(path)}`,
            type: "DELETE",
            success: () => loadDirectory(currentPath),
            error: (xhr) => alert("Delete failed: " + xhr.responseText),
        });
    }

    /// Upload ///
    function initUploadForm() {
        $("#upload-form").on("submit", function (e) {
            e.preventDefault();

            const fileInput = $("#file-input")[0];
            const warning = $("#upload-warning");
            warning.text("");

            if (fileInput.files.length === 0) {
                warning.text("Please select a file before attempting to upload.");
                return;
            }

            const file = fileInput.files[0];
            const fileName = file.name;
            const uploadPath = currentPath === "/" ? "." : currentPath;

            $.get("/api/fileexplorer/exists", { path: uploadPath, filename: fileName }, (response) => {
                if (response.exists) {
                    if (!confirm(`"${fileName}" already exists. Replace it?`)) {
                        return;
                    }
                }

                const formData = new FormData();
                formData.append("file", file);
                formData.append("path", uploadPath);

                $.ajax({
                    url: "/api/fileexplorer/upload",
                    type: "POST",
                    data: formData,
                    contentType: false,
                    processData: false,
                    success: () => {
                        alert("Upload successful!");
                        loadDirectory(currentPath);
                    },
                    error: (xhr) => alert("Upload failed: " + xhr.responseText),
                });
            });
        });
    }

    /// Move + Copy ///
    function openMoveModal(sourcePath) {
        itemToMove = sourcePath;
        itemToCopy = null;
        clearModalSelection();

        const $item = $(`.item`).filter(function () {
            return $(this).text().includes(sourcePath.split("/").pop());
        });
        highlightSelection($item, sourcePath);

        $("#directory-modal").show();
        const basename = sourcePath.split("/").pop();
        $("#action-type-label").text(`Select Destination to Move "${basename}"`);
        loadDestinationBrowser("/");
    }

    function openCopyModal(sourcePath) {
        itemToCopy = sourcePath;
        itemToMove = null;
        clearModalSelection();

        const $item = $(`.item`).filter(function () {
            return $(this).text().includes(sourcePath.split("/").pop());
        });
        highlightSelection($item, sourcePath);

        $("#directory-modal").show();
        const basename = sourcePath.split("/").pop();
        $("#action-type-label").text(`Select Destination to Copy "${basename}"`);
        loadDestinationBrowser("/");
    }


    function performCopyOrMove() {
        const destPath = $("#confirm-modal").data("destPath");
        if (!destPath) return alert("Please select a destination.");

        if (itemToCopy) {
            $.post(
                `/api/fileexplorer/copy?sourcePath=${encodeURIComponent(sanitizePath(itemToCopy))}&destinationPath=${encodeURIComponent(
                    sanitizePath(destPath)
                )}`
            )
                .done(() => {
                    alert("Successfully Copied!");
                    resetDirectoryModal();
                    loadDirectory(currentPath);
                })
                .fail((xhr) => {
                    alert("Copy failed: " + xhr.responseText);
                });
        } else if (itemToMove) {
            $.post(
                `/api/fileexplorer/move?sourcePath=${encodeURIComponent(sanitizePath(itemToMove))}&destinationPath=${encodeURIComponent(
                    sanitizePath(destPath)
                )}`
            )
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
        $("#action-type-label").text("");
        itemToMove = null;
        itemToCopy = null;
        clearAllSelection();
    }

    function loadDestinationBrowser(path) {
        $.getJSON(`/api/fileexplorer/${path === "/" ? "" : path}`, (data) => {
            const $browser = $("#destination-browser").empty();
            $("<div>")
                .text(`Current Directory: ${path}`)
                .appendTo($browser);

            if (path !== "/") {
                const parentPath = path.split("/").slice(0, -1).join("/") || "/";
                $("<div>")
                    .text(`${Icons.back} Back`)
                    .css("cursor", "pointer")
                    .on("click", () => {
                        clearModalSelection();
                        loadDestinationBrowser(parentPath);
                    })
                    .appendTo($browser);
            }

            data.directories.forEach((dir) => {
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
                    })
                    .appendTo($browser);
            });
        });
    }

    /// Initialization ///
    $(document).ready(() => {
        $("#clear-search").hide();
        $("#directory-modal").hide();

        const params = new URLSearchParams(window.location.search);
        const initialPath = params.get("path") || "";
        loadDirectory(initialPath);

        window.onpopstate = (event) => {
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

        $("#search-input").on("keypress", (e) => {
            if (e.key === "Enter") {
                $("#search-btn").click();
            }
        });

        $("#clear-search").on("click", () => {
            $("#search-input").val("");
            $("#clear-search").hide();
            loadDirectory(currentPath);
        });

        $("#cancel-modal").on("click", resetDirectoryModal);
        $("#confirm-modal").on("click", performCopyOrMove);

        initUploadForm();
    });

})();
