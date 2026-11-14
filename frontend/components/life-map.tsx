"use client";

import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Game, Scenario } from "@/lib/game";

export function LifeMap({ game, scenario, onSelect }: {
  game: Game; scenario: Scenario; onSelect: (id: string) => void;
}) {
  const nodes: Node[] = [{ id: "root", position: { x: 265, y: 0 }, data: { label: "Original decision" } }];
  const edges: Edge[] = [];
  const columns = new Map<string, number>();
  for (const [index, path] of scenario.paths.entries()) {
    const x = index * 265;
    const base = `path-${path.id}`;
    const branches = game.branches.filter((branch) => branch.path_id === path.id);
    nodes.push({ id: base, position: { x, y: 95 }, data: { label: `${path.short} · ${branches.length ? "Explored" : "Unexplored"}` } });
    edges.push({ id: `root-${base}`, source: "root", target: base, animated: Boolean(branches.length) });
    for (const branch of branches) {
      const order = columns.get(path.id) ?? 0;
      columns.set(path.id, order + 1);
      const label = branch.events[branch.fork_at]?.choice ?? (branch.parent_id ? "Checkpoint" : path.short);
      nodes.push({
        id: branch.id, position: { x: x + (order % 2) * 105, y: 195 + order * 100 },
        data: { label: `${label} · ${branch.ending === null ? "In progress" : "Finished"}` },
        className: branch.id === game.active_id ? "current-node" : "",
      });
      edges.push({ id: branch.id, source: branch.parent_id ?? base, target: branch.id });
    }
  }
  return <div className="flow">
    <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.25} nodesDraggable={false} nodesConnectable={false}
      onNodeClick={(_, node) => { if (game.branches.some((branch) => branch.id === node.id)) onSelect(node.id); }}>
      <Background color="#575473" gap={24} /><Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
