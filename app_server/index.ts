import { PrismaClient } from "@prisma/client";
import rabbitmq from "amqplib";
import axios from "axios";
import cors from "cors";
import express from "express";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const amqpUrl = `amqp://${process.env.AMQP_USER}:${process.env.AMQP_PASSWORD}@${process.env.AMQP_HOST}`;
const queueName = process.env.AMQP_QUEUE;
const authRedirectUrl =
  process.env.AUTH_REDIRECT_URL || "http://localhost:8080/auth/github/callback";

app.use(express.json());

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";

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

    const prisma = new PrismaClient();
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
        },
      });
    }

    // You can optionally store the token in a secure cookie instead
    res.redirect(`${FRONTEND_URL}/signin/callback?token=${accessToken}`);
  } catch (error: any) {
    console.error("OAuth error:", error?.response?.data || error.message);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/deploy", async (req, res) => {
  const { repo } = req.body;
  const { service } = req.body;
  if (!repo) {
    return res.status(400).send("Missing repo or branch");
  }
  const channel = await (await rabbitmq.connect(amqpUrl)).createChannel();
  await channel.assertQueue(queueName, { durable: true });

  channel.sendToQueue(queueName, Buffer.from(`${repo},${service},234`));
  channel.close();
  res.send(`Deploying ${repo}`);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
