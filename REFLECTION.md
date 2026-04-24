Reflection

I built this project iteratively rather than using a SPEC.md or just using 1 prompt. I first defined a minimal version of what I wanted and gave it to Cursor. After the 
basic flow worked, I started to add features in layers: settings UI polish, popup improvements, stats visualizations, and finally AI Assistance. Most of my process was 
test-and-refine, where I would implement one feature, run it, observe behavior, fix bugs, and then move on to another feature. For AI support, I primarily used Cursor in 
agent mode and occasionally used the ask/plan modes on the parts that I wanted to implement myself. I also used the plan mode to go over the current project and see which 
areas can be improved and to give me ideas on new features that might be useful to add. I also used AI to explain to me why certain errors would pop up and where in the 
code is responsible for these errors. I chose this approach because the project had many moving parts (Chrome extension events, backend persistence, analytics logic). 
AI was really helpful in the beginning to create the initial working idea of the project, but as I started to have more ideas and integrate more specific features I saw 
my productivity drop a lot where I had to constantly explain to the AI that what it’s implementing is not what I want. I especially used AI to quickly test alternative 
implementations and then keep the one that matched my intended behavior and push those to github. One thing that has changed after taking this class, is when building 
these projects I spend a lot more time thinking on what exactly I want to be using and what specific features are the most important that I must have in the project. 
I feel I have started to think more in terms of system design and architecture as when using AI it often feels as if I am the planner who has the ideas and I just need 
to tell the AI agents I am using how exactly they should implement my ideas. I feel a lot more equipped to tackle larger projects as I now have an idea on how they are 
structured and the best approaches to use when doing these projects, such as choosing what I want to use for my frontend, backend, or deployment.With more time, I would 
migrate storage to a persistent database like supabase, add authentication/multi-user accounts, improve observability/debug tooling, and tighten analytics definitions so 
all metrics are unambiguous. I’d also improve onboarding UX and add tests for session tracking edge cases.
