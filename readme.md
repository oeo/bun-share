# bun-share

A command-line utility for easily sharing files via AWS S3.

This is just for my collection of personal tools and may be redundant for you.

## Features

- Upload files and directories to S3
- Random filename generation with preserved extensions
- Browser-friendly content type detection
- Directory tarball support
- AWS profile support
- Interactive bucket selection

## Installation

### As a CLI tool

```bash
# Install globally with bun
bun install -g git+https://github.com/oeo/bun-share.git

# Or with npm
npm install -g git+https://github.com/oeo/bun-share.git
```

### For Development

```bash
git clone https://github.com/oeo/bun-share.git
cd bun-share

bun install
```

## AWS Setup

1. Install AWS CLI and configure credentials:
```bash
aws configure
```

2. Create a bucket (if you don't have one):
```bash
# Using the provided script
./scripts/create-bucket.sh my-bucket-name

# Or using npm/bun script
bun run create-bucket my-bucket-name
```

## CLI Usage

```bash
# Show help
bun-share --help

# Upload a file
bun-share file.txt
# Output: https://your-bucket.s3.amazonaws.com/randomstring.txt

# Upload multiple files
bun-share file1.txt file2.js file3.jpg
# Output: 
# https://your-bucket.s3.amazonaws.com/randomstring1.txt
# https://your-bucket.s3.amazonaws.com/randomstring2.js
# https://your-bucket.s3.amazonaws.com/randomstring3.jpg

# Upload a directory (creates a tarball)
bun-share mydir/
# Output: https://your-bucket.s3.amazonaws.com/randomstring.tar.gz

# Auto-confirm directory tar uploads
bun-share --y mydir/

# Show AWS configuration
bun-share --info
```

## Programmatic Usage

```javascript
const App = require('bun-share');

async function upload() {
    const app = new App();
    await app.run(['path/to/file.txt']);
}

upload().catch(console.error);
```

## Configuration

### Environment Variables

- `BUN_SHARE_BUCKET`: S3 bucket name
- `BUN_SHARE_AWS_PROFILE`: AWS profile name (default: default)

### AWS Credentials

Credentials are loaded from standard AWS configuration files:
- `~/.aws/credentials`
- `~/.aws/config`

## Supported File Types

### Browser-Viewable Files
- Text: `.txt`, `.js`, `.json`, `.md`, `.css`, `.html`, `.htm`, `.xml`, `.csv`, `.log`, `.yml`, `.yaml`, `.coffee`, `.sh`
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`
- Documents: `.pdf`

### Other Supported Types
- Archives: `.zip`, `.tar`, `.tar.gz`, `.7z`
- All other files are uploaded as `application/octet-stream`

## Security Notes

- Files are uploaded with public read access
- Random filenames provide basic obscurity
- Bucket requires proper AWS credentials for uploads
- Text files are served with no-cache headers
- Binary files are served with long-term cache headers

## License

MIT
