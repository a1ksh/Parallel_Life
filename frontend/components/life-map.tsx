"use client";

import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Game, Scenario } from "@/lib/game";

export function LifeMap({ game, scenario, onSelect, onFork }: {
  game: Game; scenario: Scenario; onSelect: (id: string) => void; onFork: (id: string, index: number) => void;
}) {
  const nodes: Node[] = [{ id: "root", position: { x: 300, y: 0 }, data: { label: "Original decision" }, focusable: false }];
  const edges: Edge[] = [];
  const checkpointActions = new Map<string, { id: string; index: number }>();
  const saved = game.branches.find((branch) => branch.id === game.active_id);
  for (const [index, path] of scenario.paths.entries()) {
    const x = index * 300;
    const base = `path-${path.id}`;
    const branches = game.branches.filter((branch) => branch.path_id === path.id);
    nodes.push({ id: base, position: { x, y: 95 }, data: { label: `${path.short} · ${branches.length ? "Explored" : "Unexplored"}` },
      className: branches.length ? "" : "unexplored-node", focusable: false });
    edges.push({ id: `root-${base}`, source: "root", target: base });
    for (const [order, branch] of branches.entries()) {
      const origin = branch.parent_id && game.branches.find((item) => item.id === branch.parent_id);
      const checkpoint = origin && `${origin.id}:${branch.fork_at}`;
      const label = branch.events[branch.fork_at]?.choice ?? (origin ? "New fork" : path.short);
      nodes.push({
        id: branch.id, position: { x, y: 205 + order * 96 },
        data: { label: <><strong>{label}</strong><small>{branch.ending === null ? "In progress" : "Finished"}</small></> },
        className: branch.id === game.active_id ? "current-node" : "",
      });
      if (checkpoint && origin && !checkpointActions.has(checkpoint)) {
        const originOrder = branches.indexOf(origin);
        checkpointActions.set(checkpoint, { id: origin.id, index: branch.fork_at });
        nodes.push({ id: checkpoint, position: { x: x + 146, y: 267 + originOrder * 96 + branch.fork_at * 14 },
          className: "checkpoint-node", data: { label: `Fork · ${origin.events[branch.fork_at]?.scene ?? "Saved decision"}` } });
        edges.push({ id: `from-${checkpoint}`, source: origin.id, target: checkpoint });
      }
      edges.push({ id: branch.id, source: checkpoint || base, target: branch.id });
    }
  }
  if (saved) {
    for (const [index, event] of saved.events.entries()) {
      const id = `${saved.id}:${index}`;
      if (checkpointActions.has(id)) continue;
      const node = nodes.find((item) => item.id === saved.id)!;
      checkpointActions.set(id, { id: saved.id, index });
      nodes.push({ id, position: { x: node.position.x + 158, y: node.position.y + 105 + index * 64 },
        data: { label: event.scene }, className: "checkpoint-node" });
      edges.push({ id: `checkpoint-${id}`, source: index && checkpointActions.has(`${saved.id}:${index - 1}`) ? `${saved.id}:${index - 1}` : saved.id, target: id });
    }
  }
  function select(id: string) {
    const fork = checkpointActions.get(id);
    if (fork) onFork(fork.id, fork.index);
    else if (game.branches.some((branch) => branch.id === id)) onSelect(id);
  }
  return <div className="flow" onKeyDown={(event) => {
    if (event.key !== "Enter" || !(event.target instanceof HTMLElement)) return;
    const id = event.target.closest<HTMLElement>(".react-flow__node")?.dataset.id;
    if (id) select(id);
  }}>
    <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.14 }} minZoom={0.2} nodesDraggable={false} nodesConnectable={false}
      onNodeClick={(_, node) => select(node.id)}>
      <Background color="#575473" gap={24} /><Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
