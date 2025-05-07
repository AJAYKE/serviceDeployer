import { ChangeEvent, KeyboardEvent, useState } from "react";
import axiosInstance from "../../axios/axiosConfiguration";
import "./input.css";

const Input = () => {
  const [url, setUrl] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleSubmitClick = (): void => {
    const urlPattern =
      /^(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?$/;
    if (urlPattern.test(url)) {
      axiosInstance
        .post("/deploy", { url })
        .then((res) => {
          console.log(res);
        })
        .catch((err) => {
          console.error(err);
        });
    } else {
      setError("Invalid format. Please enter a valid GitHub repo URL.");
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setError("");
    setUrl(e.target.value);
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      handleSubmitClick();
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h2 className="title">Deploy your GitHub Repository</h2>
        <p className="subtitle">
          Enter the URL of your GitHub repository to deploy it
        </p>

        <div className="input-group">
          <label htmlFor="github-url">GitHub Repository URL</label>
          <input
            id="github-url"
            type="text"
            placeholder="https://github.com/username/repo"
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          {error && <small className="error">{error}</small>}
        </div>

        <button className="upload-btn" onClick={handleSubmitClick}>
          Upload
        </button>
      </div>
    </div>
  );
};

export default Input;
