# GitHub Basics

Think of Git and GitHub like this:

- `Git` tracks changes to your code on your computer.
- `GitHub` is the website where that code lives online.
- A `repository` or `repo` is your project folder on GitHub.
- A `commit` is a saved checkpoint.
- A `branch` is a separate lane of work.
- A `pull request` or `PR` is a request to merge one branch into another.
- `Merge request` is basically the same thing. GitHub calls it a `pull request`. GitLab calls it a `merge request`.

The normal flow is:

1. Start from the main project branch, usually `main`.
2. Create a new branch for your work.
3. Change files on that branch.
4. Commit your changes.
5. Push that branch to GitHub.
6. Open a pull request.
7. Review it, discuss it, then merge it.

A very common real-life example:

- `main` = stable website
- `fix-hero-section` = your new branch
- You edit the hero section there
- You push it
- You open a PR
- After review, you merge it into `main`

## The 5 commands you should know first

```bash
git status
git add .
git commit -m "Fix hero sticky screenshot"
git push
git pull
```

What they mean:

- `git status` shows what changed
- `git add .` stages changes for commit
- `git commit -m "message"` saves a checkpoint
- `git push` sends commits to GitHub
- `git pull` gets latest changes from GitHub

## Branch Workflow

Create a branch:

```bash
git checkout -b my-new-feature
```

This means: create a new branch and switch to it.

Later, push it:

```bash
git push -u origin my-new-feature
```

Now GitHub knows about your branch.

## What a Pull Request Is

A pull request says:

"I finished work on branch `my-new-feature`. Please merge it into `main`."

Inside a PR, you can:

- see changed files
- leave comments
- discuss changes
- run checks
- merge when ready

## How to Make a PR on GitHub

After you push your branch, GitHub usually shows a button like:

`Compare & pull request`

Then:

1. Click it
2. Add a title
3. Add a short description
4. Create pull request
5. Review
6. Click `Merge pull request` when ready

## Good Beginner Habit

Before starting new work:

```bash
git checkout main
git pull
git checkout -b feature-name
```

This keeps your new branch fresh.

## What Merge Means

Merging means combining your branch into another branch.

Example:

- `main` has old code
- `feature-button-redesign` has your new code
- merging puts your changes into `main`

After merge, `main` contains both.

## What Merge Conflict Means

A merge conflict happens when:

- you changed a line
- someone else changed the same line
- Git does not know which version to keep

Then you manually choose the correct version.

It sounds scary, but it is normal.

## Simple Safe Workflow for You

If you are new, follow this every time:

1. Pull latest code
2. Create a new branch
3. Make changes
4. Commit often
5. Push branch
6. Open PR
7. Merge after checking

## Commit Messages

Bad:

```bash
git commit -m "stuff"
```

Better:

```bash
git commit -m "Add sticky hero screenshot behavior"
```

Try to say what changed.

## What to Avoid

- Don't work directly on `main` if possible
- Don't make huge commits with 50 unrelated changes
- Don't force push unless you know why
- Don't panic if Git says conflict

## Cheat Sheet

```bash
git status
git pull
git checkout -b feature-name
git add .
git commit -m "Describe change"
git push -u origin feature-name
```

Then open PR on GitHub.

## Very Simple Mental Model

- branch = draft workspace
- commit = save point
- push = upload your work
- PR/MR = ask to merge
- merge = finalize into main
