import { Friend } from "@/data/mockData";

const rooftop = "wrld_00000000-0000-0000-0000-000000000001:84210~region(eu)";
const garden = "wrld_00000000-0000-0000-0000-000000000002:19280~hidden(usr_sample)~region(jp)";
const cafe = "wrld_00000000-0000-0000-0000-000000000003:31416~friends(usr_sample)~region(use)";
export const sampleFriends: Friend[] = [
  { name: "Luna", location: rooftop, worldName: "Sunset Rooftop", lastMessage: "Watching the sky turn pink." },
  { name: "NeonFox", location: rooftop, worldName: "Sunset Rooftop", lastMessage: "Come hang out for a while." },
  { name: "Kitsune", location: garden, worldName: "The Floating Garden", lastMessage: "A quiet place to unwind." },
  { name: "Cloudy", location: garden, worldName: "The Floating Garden", lastMessage: "Taking the scenic route." },
  { name: "Astro", location: cafe, worldName: "Moonlight Café", lastMessage: "Good music. Better company." },
  { name: "Mochi", location: "private", lastMessage: "A little time to myself." },
  { name: "Pixel", location: "traveling", lastMessage: "Looking for somewhere new." },
  { name: "Yuki", location: "offline", lastMessage: "See you soon." },
].map((friend, index) => ({ ...friend, id: `sample-${index}`, online: friend.location !== "offline", avatar: "", lastMessageTime: "", unread: 0 }));
