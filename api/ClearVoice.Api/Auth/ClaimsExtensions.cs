using System.Security.Claims;
using System.Text.Json;

namespace ClearVoice.Api.Auth;

public static class ClaimsExtensions
{
    public static string UserId(this ClaimsPrincipal user) =>
        user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;

    public static string Username(this ClaimsPrincipal user) =>
        user.FindFirstValue("preferred_username") ?? user.FindFirstValue(ClaimTypes.Name) ?? string.Empty;

    public static string? MerchantId(this ClaimsPrincipal user) =>
        user.FindFirstValue("merchant_id");

    public static string? OrganisationName(this ClaimsPrincipal user) =>
        user.FindFirstValue("organisation_name");

    public static string? Email(this ClaimsPrincipal user) =>
        user.FindFirstValue("email") ?? user.FindFirstValue(ClaimTypes.Email);

    public static string? FullName(this ClaimsPrincipal user) =>
        user.FindFirstValue("name") ?? user.FindFirstValue(ClaimTypes.GivenName);

    public static IReadOnlyList<string> RealmRoles(this ClaimsPrincipal user)
    {
        // Keycloak emits realm roles as: realm_access.roles (JSON object in token)
        // The JWT bearer middleware flattens nested JSON claims differently per version.
        // We check both the flat claim name and the nested path.
        var roles = new List<string>();

        // Try flat claim added by the protocol mapper config in realm JSON
        roles.AddRange(user.FindAll("realm_access.roles").Select(c => c.Value));

        // Fallback: parse the realm_access claim as JSON
        if (roles.Count == 0)
        {
            var raw = user.FindFirstValue("realm_access");
            if (!string.IsNullOrEmpty(raw))
            {
                try
                {
                    var doc = JsonDocument.Parse(raw);
                    if (doc.RootElement.TryGetProperty("roles", out var arr))
                        roles.AddRange(arr.EnumerateArray().Select(e => e.GetString() ?? string.Empty));
                }
                catch { /* ignore malformed */ }
            }
        }

        // Also include standard ClaimTypes.Role
        roles.AddRange(user.FindAll(ClaimTypes.Role).Select(c => c.Value));

        return roles.Distinct().ToList();
    }

    public static bool HasRole(this ClaimsPrincipal user, string role) =>
        user.RealmRoles().Contains(role, StringComparer.OrdinalIgnoreCase);

    public static bool IsMerchantEmployee(this ClaimsPrincipal user) =>
        user.HasRole("merchant_employee");

    public static bool IsFinanceStaff(this ClaimsPrincipal user) =>
        user.HasRole("finance_staff");
}
