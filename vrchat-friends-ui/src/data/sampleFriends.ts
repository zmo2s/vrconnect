import { Friend } from "@/data/mockData";

const rooftop = "wrld_00000000-0000-0000-0000-000000000001:84210~region(eu)";
const garden = "wrld_00000000-0000-0000-0000-000000000002:19280~hidden(usr_sample)~region(jp)";
const cafe = "wrld_00000000-0000-0000-0000-000000000003:31416~friends(usr_sample)~region(use)";
export const sampleFriends: Friend[] = [
  { name: "Luna", location: rooftop, worldName: "Sunset Rooftop", lastMessage: "Watching the sky turn pink.", status: "joinme" },
  { name: "NeonFox", location: rooftop, worldName: "Sunset Rooftop", lastMessage: "Come hang out for a while.", status: "active" },
  { name: "Kitsune", location: garden, worldName: "The Floating Garden", lastMessage: "A quiet place to unwind.", status: "askme" },
  { name: "Cloudy", location: garden, worldName: "The Floating Garden", lastMessage: "Taking the scenic route.", status: "active" },
  { name: "Astro", location: cafe, worldName: "Moonlight Café", lastMessage: "Good music. Better company.", status: "joinme" },
  { name: "Mochi", location: "private", lastMessage: "A little time to myself.", status: "busy" },
  { name: "Pixel", location: "traveling", lastMessage: "Looking for somewhere new.", status: "active" },
  { name: "Yuki", location: "offline", lastMessage: "See you soon.", status: "offline", lastLogin: new Date(Date.now() - 3 * 3600_000).toISOString() },
].map((friend, index) => ({ ...friend, status: friend.status as Friend["status"], id: `sample-${index}`, online: friend.location !== "offline", avatar: "", lastMessageTime: "", unread: 0 }));
