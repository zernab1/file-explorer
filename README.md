# File Explorer App

A single-page file browser application (SPA) built using **jQuery** and **ASP.NET Core (.NET 8)** for the backend API.

This app provides basic file and directory browsing with additional functionality to copy, move, delete, and search the directory.

## Features

- Browse and navigate folders and files
- Download and upload files
- Copy or move files/folders to a new location within the directory via a pop up modal
- Delete files/folders
- Partial search for files and directories
- All UI rendering is client-side (using a deep linkable URL pattern)

### Instructions for running

- Configure `appsettings.json`

Set `HomeDirectory` variable to a valid path on your machine where you'd like the web app to render the file structure.

```json
{
  "HomeDirectory": "C:\\Path\\To\\Your\\Directory"
}
```

Note that very large file systems may impact performance or cause issues specifically with *search* capability, as this app performs recursive traversal which is not optimized for massive directory trees...

- From the root of the project, run:

```
dotnet restore
dotnet run
```

### Developer Note
- Developed on macOS via VSC and C# Dev Kit extension, and believe this should run in Visual Studio 2022+ as well

