const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types");
require("dotenv").config();
const rabbitmq = require("amqplib");
const { PrismaClient } = require("../generated/prisma");

const s3Client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.aws_access_key_id,
    secretAccessKey: process.env.aws_secret_access_key,
  },
});

const prisma = new PrismaClient();

const BUCKET_NAME = process.env.BUCKET_NAME || "my-vercel-bucket";

const potentialOutputFolders = ["dist", "build", "public", "out"];

function findFrontendOutputFolders(appDir) {
  const outputFolders = [];
  try {
    const filesAndDirs = fs.readdirSync(appDir);
    filesAndDirs.forEach((item) => {
      const itemPath = path.join(appDir, item);
      if (
        fs.statSync(itemPath).isDirectory() &&
        potentialOutputFolders.includes(item)
      ) {
        outputFolders.push(itemPath);
      }
    });
  } catch (error) {
    console.error(`Error reading directory: ${error.message}`);
  }
  return outputFolders;
}

const uploadFileWithRetry = async (itemPath, s3Key, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Uploading (attempt ${attempt}): ${itemPath}`);

      // Read file content into buffer instead of using stream
      const fileContent = fs.readFileSync(itemPath);

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `__outputs/${PROJECT_ID}/${s3Key}`, // PROJECT_ID is actually deploymentId now
        Body: fileContent,
        ContentType: mime.lookup(itemPath) || "application/octet-stream",
      });

      await s3Client.send(command);
      console.log(`✓ Successfully uploaded: ${itemPath}`);
      return true;
    } catch (error) {
      console.error(`Attempt ${attempt} failed for ${itemPath}:`, {
        message: error.message,
        code: error.Code || error.code,
        statusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
      });

      if (attempt === maxRetries) {
        console.error(
          `✗ Final upload failure for ${itemPath} after ${maxRetries} attempts`
        );
        return false;
      }

      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const uploadFolderRecursively = async (folderPath, prefix = "") => {
  const folderContents = fs.readdirSync(folderPath);
  let successCount = 0;
  let failureCount = 0;

  for (const item of folderContents) {
    const itemPath = path.join(folderPath, item);
    const s3Key = `${prefix}${item}`;

    if (fs.lstatSync(itemPath).isDirectory()) {
      const result = await uploadFolderRecursively(itemPath, `${s3Key}/`);
      successCount += result.successCount;
      failureCount += result.failureCount;
    } else {
      const success = await uploadFileWithRetry(itemPath, s3Key);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }
  }

  return { successCount, failureCount };
};

const cleanup = async (outDirPath) => {
  try {
    if (fs.existsSync(outDirPath)) {
      fs.rmSync(outDirPath, { recursive: true, force: true });
      console.log(`Cleaned up directory: ${outDirPath}`);
    }
  } catch (error) {
    console.error(`Error cleaning up directory: ${error.message}`);
  }
};

// Helper function to execute shell commands with Promise
const execPromise = (command, options = {}) => {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

// Global variables for git repo info and deployment ID
let GIT_REPOSITORY_URL, SERVICE_PATH, DEPLOYMENT_ID;

async function init() {
  console.log("Executing script.js");

  const outDirPath = path.join(__dirname, "output");
  await cleanup(outDirPath);

  let deploymentStatus = "FAILED"; // Default status

  try {
    const cloneCommand = `git clone ${GIT_REPOSITORY_URL} ${outDirPath}`;
    console.log("Cloning repository...");
    const { stdout } = await execPromise(cloneCommand);
    console.log(stdout);

    const servicePathFull = path.join(outDirPath, SERVICE_PATH);
    if (!fs.existsSync(servicePathFull)) {
      console.error(`Service path not found: ${servicePathFull}`);
      return;
    }

    await buildProject(outDirPath);
    deploymentStatus = "SUCCESS";
  } catch (error) {
    console.error(`Error during deployment: ${error.error?.message || error}`);
    deploymentStatus = "FAILED";
  } finally {
    await prisma.deployment.update({
      where: { id: DEPLOYMENT_ID },
      data: { status: deploymentStatus },
    });
    console.log(
      `Deployment ${DEPLOYMENT_ID} status updated to ${deploymentStatus}`
    );
    await cleanup(outDirPath);
  }
}

async function buildProject(outDirPath) {
  const servicePath = path.join(outDirPath, SERVICE_PATH);

  try {
    // Check which package manager to use
    let buildCommand;

    if (fs.existsSync(path.join(servicePath, "yarn.lock"))) {
      buildCommand = "yarn --frozen-lockfile && yarn run build";
    } else if (fs.existsSync(path.join(servicePath, "package-lock.json"))) {
      buildCommand = "npm ci && npm run build";
    } else if (fs.existsSync(path.join(servicePath, "pnpm-lock.yaml"))) {
      buildCommand =
        "corepack enable pnpm && pnpm i --frozen-lockfile && pnpm run build";
    } else if (fs.existsSync(path.join(servicePath, "bun.lock"))) {
      buildCommand = "bun install --no-save && bun run build";
    } else {
      throw new Error("No lockfile found");
    }

    console.log("Installing dependencies and building...");
    const { stdout: buildStdout } = await execPromise(buildCommand, {
      cwd: servicePath,
    });
    console.log(buildStdout);

    // Check if it's a Next.js project and run export if needed
    const packageJsonPath = path.join(servicePath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
        console.log("Next.js project detected, running export...");
        try {
          // Try different export commands based on package manager
          let exportCommand;
          if (fs.existsSync(path.join(servicePath, "yarn.lock"))) {
            exportCommand = "yarn export";
          } else if (fs.existsSync(path.join(servicePath, "pnpm-lock.yaml"))) {
            exportCommand = "pnpm export";
          } else if (fs.existsSync(path.join(servicePath, "bun.lockb"))) {
            exportCommand = "bun export";
          } else {
            exportCommand = "npm run export";
          }

          const { stdout: exportStdout } = await execPromise(exportCommand, {
            cwd: servicePath,
          });
          console.log(exportStdout);
        } catch (exportError) {
          console.log("Export command failed, continuing with build output...");
        }
      }
    }

    const foundOutputFolders = findFrontendOutputFolders(servicePath);
    console.log("Found output folders:", foundOutputFolders);

    if (foundOutputFolders.length === 0) {
      console.error("No output folders found.");
      return;
    }

    console.log("Starting to upload...");
    for (const folder of foundOutputFolders) {
      await uploadFolderRecursively(folder);
    }
    console.log("Upload complete.");
  } catch (error) {
    console.error(
      `Build error: ${error?.error?.message || error?.message || error}`
    );
    throw error; // Re-throw to be caught by init's try/catch
  }
}

const amqpUrl = `amqp://${process.env.AMQP_USER}:${process.env.AMQP_PASSWORD}@${process.env.AMQP_HOST}`;
const queueName = process.env.AMQP_QUEUE;

async function connect() {
  try {
    const connection = await rabbitmq.connect(amqpUrl);
    const channel = await connection.createChannel();
    await channel.assertQueue(queueName, { durable: true });

    channel.consume(queueName, async (msg) => {
      if (msg !== null) {
        const [gitRepoUrl, servicePath, deploymentId] = msg.content
          .toString()
          .split(",");
        console.log("Received message:", gitRepoUrl, servicePath, deploymentId);
        GIT_REPOSITORY_URL = `https://github.com/${gitRepoUrl}`;
        SERVICE_PATH = servicePath;
        DEPLOYMENT_ID = deploymentId; // Assign to DEPLOYMENT_ID
        await init();
        channel.ack(msg);
      }
    });
  } catch (error) {
    console.error(`Error connecting to RabbitMQ: ${error.message}`);
  }
}

connect();
