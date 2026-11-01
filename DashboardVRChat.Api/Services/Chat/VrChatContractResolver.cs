using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using VRChat.API.Model;

namespace DashboardVRChat.Api.Services.ChatService;

// VRChat can omit imageUrl in friends responses, but SDK 2.20.7 requires it.
// Keep validation of every other SDK property intact.
public sealed class VrChatContractResolver : DefaultContractResolver
{
    protected override JsonProperty CreateProperty(MemberInfo member, MemberSerialization memberSerialization)
    {
        var property = base.CreateProperty(member, memberSerialization);
        if (member.DeclaringType == typeof(LimitedUserFriend)
            && property.PropertyName == "imageUrl")
        {
            property.Required = Required.Default;
        }

        return property;
    }
}
