import { PrismaClient } from "@prisma/client";
import rabbitmq from "amqplib";
import axios from "axios";
import cors from "cors";
import express from "express";

const app = express();
const prisma = new PrismaClient(); // Initialize Prisma client

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const amqpUrl = `amqp://${process.env.AMQP_USER}:${process.env.AMQP_PASSWORD}@${process.env.AMQP_HOST}`;
const queueName = process.env.AMQP_QUEUE;
const authRedirectUrl =
  process.env.AUTH_REDIRECT_URL || "http://localhost:8080/auth/github/callback";

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";

// Middleware to verify user and attach to req (simplified, consider JWT for production)
const authenticateUser = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("Authorization header missing");
  }

  const token = authHeader.split(" ")[1]; // Assuming "Bearer <token>"
  if (!token) {
    return res.status(401).send("Token missing");
  }

  try {
    // In a real application, you'd verify a JWT here.
    // For now, we'll use the GitHub access token directly to fetch user info.
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const userRes = await axios.get("https://api.github.com/user", { headers });
    req.user = userRes.data; // Attach GitHub user data to request
    next();
  } catch (error) {
    console.error(
      "Authentication error:",
      (error as any)?.response?.data || (error as any).message
    );
    res.status(401).send("Invalid token");
  }
};

app.get("/health", (req, res) => {
  res.send("Hello World!");
});

app.get("/auth/github", (req, res) => {
  const redirect_uri = authRedirectUrl;
  const scope = " read:user repo";
  res.redirect(
    `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=${scope}&redirect_uri=${redirect_uri}`
  );
});

app.get("/auth/github/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing GitHub code");

    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      },
      {
        headers: {
          Accept: "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      console.error("No access token:", tokenRes.data);
      return res.status(500).send("GitHub token exchange failed");
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const userRes = await axios.get("https://api.github.com/user", { headers });
    const user = userRes.data;

    let userRecord = await prisma.user.findUnique({
      where: { githubId: user.id.toString() },
    });

    if (!userRecord) {
      const emailsRes = await axios.get(
        "https://api.github.com/user/public_emails",
        {
          headers,
        }
      );

      console.log("Emails response:", emailsRes.data);

      const primaryEmail = emailsRes.data.find(
        (e: any) => e.primary && e.verified
      )?.email;

      userRecord = await prisma.user.create({
        data: {
          username: user.login,
          avatar: user.avatar_url,
          email: primaryEmail,
          githubId: user.id.toString(),
          githubAccessToken: accessToken, // Store the access token securely
        },
      });
    } else {
      // Update access token if user already exists (optional, depends on your auth strategy)
      await prisma.user.update({
        where: { id: userRecord.id },
        data: { githubAccessToken: accessToken },
      });
    }

    res.redirect(`${FRONTEND_URL}/signin/callback?token=${accessToken}`); // Still send token to frontend for now for simplicity, but a secure cookie is better.
  } catch (error: any) {
    console.error("OAuth error:", error?.response?.data || error.message);
    res.status(500).send("Internal Server Error");
  }
});

// New endpoint to fetch user's repositories
app.get("/api/repos", authenticateUser, async (req: any, res) => {
  try {
    const userRecord = await prisma.user.findUnique({
      where: { githubId: req.user.id.toString() },
    });

    if (!userRecord || !userRecord.githubAccessToken) {
      return res.status(404).send("User or access token not found");
    }

    const headers = {
      Authorization: `Bearer ${userRecord.githubAccessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const reposRes = await axios.get("https://api.github.com/user/repos", {
      headers,
    });
    res.json(reposRes.data);
  } catch (error) {
    console.error(
      "Error fetching repositories:",
      (error as any)?.response?.data || (error as any).message
    );
    res.status(500).send("Error fetching repositories");
  }
});

// New endpoint to fetch repository contents (folders)
app.get(
  "/api/repos/:owner/:repo/contents",
  authenticateUser,
  async (req: any, res) => {
    try {
      const { owner, repo } = req.params;
      const userRecord = await prisma.user.findUnique({
        where: { githubId: req.user.id.toString() },
      });

      if (!userRecord || !userRecord.githubAccessToken) {
        return res.status(404).send("User or access token not found");
      }

      const headers = {
        Authorization: `Bearer ${userRecord.githubAccessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };

      const contentsRes = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/contents`,
        {
          headers,
        }
      );
      res.json(contentsRes.data);
    } catch (error) {
      console.error(
        "Error fetching repo contents:",
        (error as any)?.response?.data || (error as any).message
      );
      res.status(500).send("Error fetching repository contents");
    }
  }
);

app.post("/deploy", authenticateUser, async (req: any, res) => {
  const { repo, service, projectName } = req.body; // Added projectName
  const userId = (
    await prisma.user.findUnique({
      where: { githubId: req.user.id.toString() },
    })
  )?.id;

  if (!repo || !service || !userId) {
    return res.status(400).send("Missing repo, service, or user ID");
  }

  try {
    // 1. Create a new project record in the database
    const project = await prisma.projects.create({
      data: {
        repo: repo,
        userId: userId,
        name: projectName || repo.split("/")[1], // Use provided name or default to repo name
      },
    });

    // 2. Create a new deployment record in the database
    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        status: "PENDING",
      },
    });

    const channel = await (await rabbitmq.connect(amqpUrl)).createChannel();
    await channel.assertQueue(queueName, { durable: true });

    // Pass projectId to the worker
    channel.sendToQueue(
      queueName,
      Buffer.from(`${repo},${service},${deployment.id}`)
    );
    channel.close();

    res.status(202).json({
      message: `Deployment of ${repo} triggered successfully!`,
      projectId: project.id,
      deploymentId: deployment.id,
    });
  } catch (error: any) {
    console.error("Deployment error:", error.message);
    res.status(500).send("Internal Server Error during deployment initiation.");
  }
});

// New endpoint to get user's projects
app.get("/api/projects", authenticateUser, async (req: any, res) => {
  try {
    const userId = (
      await prisma.user.findUnique({
        where: { githubId: req.user.id.toString() },
      })
    )?.id;
    if (!userId) {
      return res.status(404).send("User not found");
    }
    const projects = await prisma.projects.findMany({
      where: { userId: userId },
      include: { Deployment: { orderBy: { createdAt: "desc" } } }, // Include deployments for each project
    });
    res.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", (error as any).message);
    res.status(500).send("Error fetching projects");
  }
});

// New endpoint to get a single project's deployments
app.get(
  "/api/projects/:projectId/deployments",
  authenticateUser,
  async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const deployments = await prisma.deployment.findMany({
        where: { projectId: projectId },
        orderBy: { createdAt: "desc" },
      });
      res.json(deployments);
    } catch (error) {
      console.error("Error fetching deployments:", (error as any).message);
      res.status(500).send("Error fetching deployments");
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
