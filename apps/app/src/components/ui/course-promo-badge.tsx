"use client";

import * as React from "react";
import { Sparkles, Rocket, X, ExternalLink, Code, MessageSquare, Brain, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";
import { Button } from "./button";

export function CoursePromoBadge() {
  const [open, setOpen] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <button
          onClick={() => setOpen(true)}
          className="group cursor-pointer flex items-center gap-2 pl-4 pr-2 py-2 bg-primary text-primary-foreground rounded-full font-semibold text-sm shadow-lg hover:bg-primary/90 hover:scale-105 transition-all border border-border"
        >
          <Sparkles className="size-4" />
          <span>Become a 10x Dev</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            className="p-1 rounded-full hover:bg-primary-foreground/20 transition-colors cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </span>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Rocket className="size-5 text-primary" />
              Learn Agentic AI Development
            </DialogTitle>
            <DialogDescription className="text-base">
              Master the tools and techniques behind modern AI-assisted coding
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-accent/50 border border-border">
              <p className="text-sm text-foreground">
                Did you know <span className="font-semibold">Automaker was built entirely through agentic coding</span>?
                Want to learn how? Check out the course!
              </p>
            </div>

            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">Agentic Jumpstart</span> teaches you
              how to leverage AI tools to build software faster and smarter than ever before.
            </p>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Terminal className="size-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Claude Code Mastery</p>
                  <p className="text-sm text-muted-foreground">
                    Learn to use Claude Code effectively for autonomous development workflows
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Code className="size-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Cursor & AI IDEs</p>
                  <p className="text-sm text-muted-foreground">
                    Master Cursor and other AI-powered development environments
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <MessageSquare className="size-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Prompting Techniques</p>
                  <p className="text-sm text-muted-foreground">
                    Craft effective prompts that get you the results you need
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Brain className="size-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Context Engineering</p>
                  <p className="text-sm text-muted-foreground">
                    Structure your projects and context for optimal AI collaboration
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Maybe Later
            </Button>
            <Button
              onClick={() => window.open("https://agenticjumpstart.com", "_blank")}
            >
              <ExternalLink className="size-4" />
              Get Started
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
