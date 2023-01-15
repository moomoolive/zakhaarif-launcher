export const generateTemplate = ({
    importSource, 
    securityPolicy
}: {importSource: string, securityPolicy: string}) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sandbox</title>
    <meta http-equiv="Content-Security-Policy" content="${securityPolicy}"/>
</head>
<body>
    <div id="root"></div>
    <script entry="${importSource}" id="root-script" src="secure.mjs" type="module" defer> </script>
</body>
</html>`.trim()
}