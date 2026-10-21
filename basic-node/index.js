const express = require("express");
const path = require("path");

const app = express();
const projectRoot = path.resolve(__dirname, "..");

app.use((request, response, next) => {
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});

app.use(express.static(projectRoot));

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`TIMirror is available at http://localhost:${port}`);
});
