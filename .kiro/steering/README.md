# Steering Files Guide

## Location
All steering files are located in `.kiro/steering/` directory.

## Files Overview

### 1. project.yaml
**Purpose**: High-level project metadata and structure

**Contains**:
- Project name, description, type
- Language used (TypeScript)
- Directory structure
- Key technologies
- Development workflow commands
- Build configuration files
- Entry points
- Testing strategy

**Use When**:
- Need overview of project structure
- Understanding what technologies are used
- Finding entry points and key directories

### 2. build-commands.yaml
**Purpose**: Build and development command reference

**Contains**:
- Web build command and description
- Android build command and description
- Key difference between web/Android builds
- Sync commands
- Development server commands
- Linting commands
- Environment variable explanation (`VITE_DONATE`)

**Use When**:
- Need to run a specific build
- Understanding build differences
- Setting up CI/CD
- Debugging build issues

### 3. code-organization.yaml
**Purpose**: Code structure and module organization

**Contains**:
- Directory tree view of `src/`
- File-by-file breakdown with purposes
- Key patterns (seed-based deals, FLIP animations, workers)
- Build-time configuration flow diagram

**Use When**:
- Adding new features
- Understanding where code lives
- Learning project architecture
- Finding specific functionality

### 4. important-files.yaml
**Purpose**: Critical file documentation

**Contains**:
- Configuration files (vite.config.ts, tsconfig files, etc.)
- Source files (main.tsx, App.tsx, engine files, hooks)
- Purpose of each file
- Key code snippets
- Critical patterns and flags

**Use When**:
- Need to modify build configuration
- Understanding how features work
- Debugging specific issues
- Learning how files interact

### 5. common-tasks.yaml
**Purpose**: Developer task reference

**Contains**:
- How to add new features
- Modifying card behavior
- Adding new layout modes
- Modifying the solver
- Debugging techniques
- Performance optimization tips
- Testing changes workflow
- Common pitfalls to avoid
- Keyboard shortcut examples

**Use When**:
- Implementing new features
- Modifying existing functionality
- Debugging issues
- Learning best practices for this project

### 6. build-environment.yaml
**Purpose**: Build system and environment documentation

**Contains**:
- Required software versions (Node, npm, TypeScript)
- Dependencies list
- Environment variables explanation
- Build tools (Vite, TypeScript, Oxlint)
- Output structure
- Platform-specific build differences
- CI/CD considerations
- Development environment setup

**Use When**:
- Setting up development environment
- Troubleshooting build issues
- Setting up CI/CD pipeline
- Understanding environment requirements

## How to Use These Files

### For New Developers
1. Read `project.yaml` for overview
2. Read `code-organization.yaml` for structure
3. Read `important-files.yaml` for key files
4. Use `common-tasks.yaml` as reference while coding

### For Maintainers
1. Read `build-commands.yaml` and `build-environment.yaml` for build understanding
2. Read `common-tasks.yaml` for common modifications
3. Use `important-files.yaml` as quick reference

### For Debugging
1. Check `common-tasks.yaml` for debugging section
2. Review `important-files.yaml` for relevant files
3. Check `build-environment.yaml` for environment issues

### For Adding Features
1. Check `code-organization.yaml` for where to place code
2. Use `common-tasks.yaml` for pattern guidance
3. Reference `important-files.yaml` for integration points

## file Updates

Update steering files when:
- Adding/removing files
- Changing build commands
- Modifying environment variables
- Adding new directories
- Changing project structure
- Updating dependencies

## Related Documentation

- Project README: `README.md`
- License: Check for LICENSE file in root
- Git repository: `.git/`
