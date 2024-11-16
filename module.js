// module.js
const { argv, env } = process;
const { readFileSync, existsSync, statSync, appendFileSync, createReadStream } = require('fs');
const { execSync } = require('child_process');
const { S3Client, PutObjectCommand, ListBucketsCommand } = require('@aws-sdk/client-s3');
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { homedir } = require('os');
const { join, extname } = require('path');
const { createInterface } = require('readline');
const { Readable } = require('stream');
const crypto = require('crypto');

// Content type mapping
const CONTENT_TYPES = {
  '.txt': 'text/plain',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.css': 'text/css',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'text/xml',
  '.csv': 'text/csv',
  '.log': 'text/plain',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.coffee': 'text/coffeescript',
  '.sh': 'text/x-shellscript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.7z': 'application/x-7z-compressed',
};

class Config {
  static getBucket() {
    return env.BUN_SHARE_BUCKET;
  }

  static getAwsProfile() {
    return env.BUN_SHARE_AWS_PROFILE || 'default';
  }

  static addToBashrc(variable, value) {
    const bashrcPath = join(homedir(), '.bashrc');
    const exportLine = `\nexport ${variable}=${value}`;
    appendFileSync(bashrcPath, exportLine);
    console.log(`Added ${variable} to ~/.bashrc`);
  }

  static async listBuckets() {
      try {
	  const client = new S3Client({
	      credentials: fromIni({ profile: this.getAwsProfile() })
	      // Region will be loaded from profile
	  });
	  const { Buckets } = await client.send(new ListBucketsCommand({}));
	  return Buckets.map(b => b.Name);
      } catch (e) {
	  console.error("Failed to list buckets:", e.message);
	  return [];
      }
  }

  static async promptForBucket() {
    const buckets = await this.listBuckets();
    
    if (buckets.length === 0) {
      throw new Error('No S3 buckets found in your AWS account. Please create a bucket first.');
    }

    console.log('\nAvailable buckets:');
    buckets.forEach((bucket, index) => {
      console.log(`${index + 1}. ${bucket}`);
    });

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\nEnter bucket number or name: ', (answer) => {
        let bucket;
        
        // Check if input is a number
        const num = parseInt(answer);
        if (!isNaN(num) && num > 0 && num <= buckets.length) {
          bucket = buckets[num - 1];
        } else if (buckets.includes(answer)) {
          bucket = answer;
        } else {
          rl.close();
          throw new Error('Invalid bucket selection');
        }

        if (bucket) {
          Config.addToBashrc('BUN_SHARE_BUCKET', bucket);
          process.env.BUN_SHARE_BUCKET = bucket;
        }
        
        rl.close();
        resolve(bucket);
      });
    });
  }
}

class S3Uploader {
  constructor(profile) {
      this.profile = profile;
      const actualProfile = env.AWS_PROFILE || env.AWS_DEFAULT_PROFILE || profile;
      
      // Get the AWS config file parser
      const { loadSharedConfigFiles } = require("@aws-sdk/shared-ini-file-loader");

      let region = 'us-east-1';

      try {
	  const { configFile } = loadSharedConfigFiles();
	  const profileConfig = configFile?.[actualProfile] || {};
	  region = profileConfig.region || region;
      } catch (error) {
	  console.warn('Could not load AWS config file, using default region');
      }

      this.client = new S3Client({
	  credentials: fromIni({ profile: actualProfile }),
	  region: region
      });
  }

  generateRandomFilename(originalFilename) {
      // .tar.gz
      if (originalFilename.endsWith('.tar.gz')) {
	  const randomString = crypto.randomBytes(8).toString('hex');
	  return `${randomString}.tar.gz`;
      }
      
      const ext = extname(originalFilename);
      const randomString = crypto.randomBytes(8).toString('hex');
      return `${randomString}${ext}`;
  }

  getContentType(filename) {
    const ext = extname(filename).toLowerCase();
    return CONTENT_TYPES[ext] || 'application/octet-stream';
  }

  isTextFile(filename) {
    const contentType = this.getContentType(filename);
    return contentType.startsWith('text/') || 
           contentType === 'application/json' ||
           contentType === 'application/javascript';
  }

  async upload(filepath, originalFilename) {
    const fileContent = readFileSync(filepath);
    const randomFilename = this.generateRandomFilename(originalFilename);
    const contentType = this.getContentType(originalFilename);
    
    const command = new PutObjectCommand({
      Bucket: Config.getBucket(),
      Key: randomFilename,
      Body: fileContent,
      ContentType: contentType,
      CacheControl: this.isTextFile(originalFilename) ? 'no-cache' : 'max-age=31536000'
    });

    try {
      await this.client.send(command);
      return `https://${Config.getBucket()}.s3.amazonaws.com/${randomFilename}`;
    } catch (e) {
      throw new Error(`Upload failed: ${e.message}`);
    }
  }
}

class App {
  constructor() {
    this.parseArgs();
    if (this.args.length === 0 || this.args.includes('--help') || this.args.includes('-h')) {
      this.showHelp();
      process.exit(0);
    }
  }

  showHelp() {
      const helpText = `
Usage: bun-share [options] <file(s)>

Options:
  --info          Show AWS configuration
  --y             Automatically confirm directory prompts
  -h, --help      Show this help message

Environment:
  BUN_SHARE_BUCKET         S3 bucket name
  BUN_SHARE_AWS_PROFILE    AWS profile name (default: default)

Examples:
  bun-share file.txt              Upload a single file
  bun-share --y directory/        Upload a directory
  bun-share file1.txt file2.txt   Upload multiple files

Supported text files that will render in browser:
  ${Object.entries(CONTENT_TYPES)
    .filter(([_, type]) => type.startsWith('text/') || type.startsWith('image/') || type === 'application/json')
    .map(([ext]) => ext)
    .join(', ')}
  `.trim();

    // Remove only the initial indentation from each line
    const lines = helpText.split('\n');
    const minIndent = Math.min(
        ...lines
            .filter(line => line.trim())
            .map(line => line.match(/^\s*/)[0].length)
    );

    const formattedHelp = lines
        .map(line => line.slice(minIndent))
        .join('\n');

    console.log(formattedHelp);
  }

  parseArgs() {
    this.args = argv.slice(2);
    this.options = {
      info: this.args.includes('--info'),
      autoConfirm: this.args.includes('--y'),
      help: this.args.includes('--help') || this.args.includes('-h')
    };
    this.files = this.args.filter(arg => !arg.startsWith('-'));
  }

  async checkRequirements() {
    if (!Config.getBucket()) {
      if (this.options.autoConfirm) {
        throw new Error('BUN_SHARE_BUCKET not set and --y specified');
      }
      const bucket = await Config.promptForBucket();
      if (!bucket) {
        throw new Error('Bucket name is required');
      }
    }

    if (this.options.info) {
      console.log(`
        AWS Configuration:
        Bucket: ${Config.getBucket()}
        Profile: ${Config.getAwsProfile()}
      `);
      process.exit(0);
    }
  }

  async promptForDirectory(dir) {
    if (this.options.autoConfirm) return true;

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(`${dir} is a directory. Tarball this directory to a temporary file and upload? (Y/n): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() !== 'n');
      });
    });
  }

  createTarball(dir) {
    const tmpFile = `/tmp/${Date.now()}.tar.gz`;
    execSync(`tar -czf ${tmpFile} -C ${dir} .`);
    return tmpFile;
  }

  async run() {
    await this.checkRequirements();

    if (this.files.length === 0) {
      console.error("Error: No files specified");
      this.showHelp();
      process.exit(1);
    }

    const uploader = new S3Uploader(Config.getAwsProfile());
    
    for (const file of this.files) {
      if (!existsSync(file)) {
        console.error(`File not found: ${file}`);
        continue;
      }

      let uploadFile = file;
      let originalFilename = file.split('/').pop();
      
      if (statSync(file).isDirectory()) {
        const shouldProcess = await this.promptForDirectory(file);
        if (!shouldProcess) continue;
        uploadFile = this.createTarball(file);
        originalFilename = `${originalFilename}.tar.gz`;
      }

      try {
        const url = await uploader.upload(uploadFile, originalFilename);
        console.log(url);
      } catch (e) {
        console.error(e.message);
      }
    }
  }
}

module.exports = App;

if (require.main === module) {
  (async () => {
    try {
      const app = new App();
      await app.run();
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  })();
}

