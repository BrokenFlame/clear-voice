<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "header">
        ClearVoice &ndash; Sign in
    <#elseif section = "form">

        <div style="margin-bottom:8px;">
            <p style="font-size:11px;letter-spacing:0.10em;text-transform:uppercase;color:rgba(255,255,255,0.40);margin-bottom:10px;">
                Welcome back
            </p>
            <h2 style="font-family:'DM Serif Display',serif;font-size:26px;color:#e8edf5;font-weight:400;margin-bottom:6px;line-height:1.2;">
                Sign in to <em style="color:#5b9cf6;font-style:italic;">ClearVoice</em>
            </h2>
            <p style="font-size:13px;color:rgba(255,255,255,0.45);line-height:1.6;margin-bottom:28px;">
                Upload and manage compliance call recordings for your finance agreements.
            </p>
        </div>

        <#if realm.password>
            <#-- Merchant credential login -->
            <p style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.30);margin-bottom:8px;">
                Merchant users
            </p>

            <#if messagesPerField.existsError('username','password')>
                <div class="alert alert-error" role="alert">
                    <span>${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}</span>
                </div>
            </#if>

            <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                <div>
                    <label for="username">
                        <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
                    </label>
                    <input
                        tabindex="1"
                        id="username"
                        class="form-control"
                        name="username"
                        type="text"
                        autofocus
                        autocomplete="username"
                        placeholder="your.username"
                        value="${(login.username!'')?html}"
                    />
                </div>

                <div>
                    <label for="password">${msg("password")}</label>
                    <input
                        tabindex="2"
                        id="password"
                        class="form-control"
                        name="password"
                        type="password"
                        autocomplete="current-password"
                        placeholder="••••••••"
                    />
                </div>

                <div id="kc-form-options" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                    <#if realm.rememberMe && !usernameEditDisabled??>
                        <div>
                            <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.50);cursor:pointer;font-weight:400;">
                                <input
                                    tabindex="3"
                                    id="rememberMe"
                                    name="rememberMe"
                                    type="checkbox"
                                    <#if login.rememberMe??>checked</#if>
                                />
                                ${msg("rememberMe")}
                            </label>
                        </div>
                    </#if>
                    <#if realm.resetPasswordAllowed>
                        <a tabindex="5" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                    </#if>
                </div>

                <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>

                <button tabindex="4" type="submit" id="kc-login" style="margin-top:12px;">
                    ${msg("doLogIn")}
                </button>
            </form>
        </#if>

        <#if realm.password && social.providers??>
            <div style="display:flex;align-items:center;gap:12px;margin:24px 0 16px;">
                <div style="flex:1;height:0.5px;background:rgba(255,255,255,0.10);"></div>
                <span style="font-size:11px;color:rgba(255,255,255,0.30);letter-spacing:0.05em;">or</span>
                <div style="flex:1;height:0.5px;background:rgba(255,255,255,0.10);"></div>
            </div>
            <p style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.30);margin-bottom:8px;">
                Finance company staff
            </p>
            <ul id="kc-social-providers">
                <#list social.providers as p>
                    <li>
                        <a href="${p.loginUrl}" class="social-link">
                            <#if p.alias == "azure" || p.providerId == "microsoft" || p.alias?lower_case?contains("azure")>
                                <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true"><path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/></svg>
                            </#if>
                            Continue with ${p.displayName}
                        </a>
                    </li>
                </#list>
            </ul>
        </#if>

        <div id="kc-info" style="margin-top:24px;">
            &#128274; This portal is for authorised users only. All access is logged and audited.
        </div>

    <#elseif section = "info">
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration">
                <span>${msg("noAccount")} <a tabindex="6" href="${url.registrationUrl}">${msg("doRegister")}</a></span>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
