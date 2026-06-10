<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}" class="${properties.kcHtmlClass!}">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title><#nested "header"> | ClearVoice</title>
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link rel="stylesheet" href="${url.resourcesPath}/${style}">
        </#list>
    </#if>
</head>
<body class="${properties.kcBodyClass!} ${bodyClass}">

    <#-- Top bar -->
    <header id="kc-header">
        <div id="kc-header-wrapper">
            <span>ClearVoice</span>
            <span style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.30);margin-left:4px;margin-top:2px;display:block;font-family:'DM Sans',sans-serif;">
                Finance compliance portal
            </span>
        </div>
        <span style="font-size:12px;color:rgba(255,255,255,0.25);font-family:'DM Sans',sans-serif;">
            Secured &middot; TLS 1.3
        </span>
    </header>

    <#-- Main -->
    <main id="kc-content" role="main">
        <div class="card-pf">

            <#-- Global alert messages -->
            <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                <div class="alert alert-${message.type}" role="alert">
                    <span>${kcSanitize(message.summary)?no_esc}</span>
                </div>
            </#if>

            <#nested "form">

            <#if displayInfo>
                <div id="kc-info">
                    <#nested "info">
                </div>
            </#if>
        </div>
    </main>

    <#-- Footer -->
    <footer id="kc-footer">
        <span>&copy; 2025 ClearVoice Finance Portal</span>
        <span>Powered by Keycloak &middot; OIDC 1.0</span>
    </footer>

    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
</body>
</html>
</#macro>
