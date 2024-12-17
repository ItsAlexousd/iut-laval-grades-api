import fs from 'fs';
import { swaggerSpec } from '../config/swagger';

const outputPath = 'docs';
const swaggerJson = JSON.stringify(swaggerSpec, null, 2);
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>API Documentation - IUT Laval Grades</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@latest/swagger-ui.css">
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@latest/swagger-ui-bundle.js"></script>
    <script>
        window.onload = function() {
            SwaggerUIBundle({
                spec: ${swaggerJson},
                dom_id: '#swagger-ui',
            });
        }
    </script>
</body>
</html>
`;

if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath);
}

fs.writeFileSync(`${outputPath}/index.html`, htmlContent);