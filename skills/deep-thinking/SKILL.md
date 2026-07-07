---
name: deep-thinking
description: Use when solving complex problems, debugging difficult issues, or making architectural decisions. Apply chain-of-thought reasoning and systematic analysis to any challenging task.
---

# Deep Thinking Skill

## Chain of Thought Protocol

When facing any complex problem, use this structured thinking process:

### Phase 1: Understand
1. **Restate the problem** in your own words
2. **Identify constraints** - What are the requirements, limitations, and boundaries?
3. **Clarify ambiguity** - What don't you know? What assumptions are you making?
4. **Define success** - What does a good solution look like?

### Phase 2: Decompose
1. **Break into subproblems** - Split the main problem into smaller, manageable pieces
2. **Identify dependencies** - Which parts depend on others?
3. **Find patterns** - Does this remind you of something you've solved before?
4. **Isolate unknowns** - What's the core difficulty?

### Phase 3: Explore
1. **Generate multiple approaches** - At least 2-3 different solutions
2. **Consider trade-offs** - For each approach, what are pros/cons?
3. **Think laterally** - Are there unconventional solutions?
4. **Check assumptions** - Are your premises correct?

### Phase 4: Decide
1. **Evaluate options** - Use criteria like:
   - Simplicity
   - Performance
   - Maintainability
   - Risk
   - Time to implement
2. **Choose best approach** - Justify your decision
3. **Plan implementation** - Step-by-step breakdown
4. **Identify risks** - What could go wrong? What's the fallback?

### Phase 5: Execute
1. **Start with the simplest version** - Get it working first
2. **Iterate** - Refactor and improve
3. **Verify** - Does it solve the original problem?
4. **Document** - What did you learn? What would you do differently?

## Debugging Protocol

When debugging difficult issues:

### 1. Reproduce
- Can you reliably reproduce the issue?
- What are the exact steps?
- What's the environment?

### 2. Isolate
- Binary search through possibilities
- Change one variable at a time
- Add logging/assertions at key points

### 3. Hypothesize
- What are possible causes?
- Which is most likely given the symptoms?
- How would you test each hypothesis?

### 4. Test
- Design a minimal test for your hypothesis
- Run the test
- Analyze results

### 5. Fix & Verify
- Implement the fix
- Verify it works
- Check for side effects
- Add regression tests

## Mental Models

### First Principles Thinking
- Break down to fundamental truths
- Build up from there
- Don't assume based on convention

### Inversion
- Instead of "how to succeed", ask "what would guarantee failure?"
- Avoid those things

### Second-Order Thinking
- And then what?
- What are the consequences of the consequences?

### Map vs Territory
- Your model of the problem is not the problem itself
- Update your model based on new information

### Hanlon's Razor
- Don't attribute to malice what can be explained by ignorance
- Don't attribute to ignorance what can be explained by carelessness

## Decision Framework

For architectural or design decisions:

```
Option A:
  Pros: ...
  Cons: ...
  Risk: Low/Medium/High
  Effort: Small/Medium/Large

Option B:
  Pros: ...
  Cons: ...
  Risk: Low/Medium/High
  Effort: Small/Medium/Large

Recommendation: [Option X] because [reasoning]
```

## Questions to Ask Yourself

1. What am I optimizing for?
2. What's the simplest solution that could work?
3. What are the edge cases?
4. How will this scale?
5. What happens when this breaks?
6. Can I test this?
7. Will I understand this in 6 months?
8. Is this the right abstraction level?

## Common Pitfalls to Avoid

- **Analysis paralysis**: Don't over-think simple problems
- **Solution bias**: Don't fall in love with your first idea
- **Anchoring**: Don't be overly influenced by initial information
- **Confirmation bias**: Don't only look for evidence that supports your view
- **Sunk cost fallacy**: Don't continue just because you've invested time
- **Scope creep**: Don't expand requirements mid-implementation

## When to Stop Thinking and Start Doing

- When you've explored at least 2-3 alternatives
- When you understand the trade-offs
- When the cost of thinking exceeds the cost of trying
- When you have a "good enough" solution
- When you can identify and mitigate the risks
