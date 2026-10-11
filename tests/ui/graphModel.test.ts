import { describe, expect, it } from 'vitest';
import { Triple } from '../../src/models/Triple';
import { createProvenance } from '../../src/models/Provenance';
import { projectGraph } from '../../src/ui/graphModel';

const anchor = 'concepts/Graph.md';
const fact = (predicate: string, object: string, inferred = false, subject = anchor) =>
	new Triple(subject, predicate, object, createProvenance(subject), inferred);
describe('focused graph projection', () => {
	it('keeps class facts as metadata and hides sources/inferred links by default', () => {
		const result = projectGraph(anchor, [
			fact('rdf:type','concept'),fact('source','papers/Graph.md'),fact('links_to','Other.md',true),
			fact('requires','Traversal.md'),fact('related_to',anchor),
		], ['Traversal.md']);
		expect(result.anchor.types).toEqual(['concept']);
		expect(result.nodes.map(node => node.id)).toEqual(['Traversal.md']);
		expect(result.counts).toMatchObject({total:3,shown:1,hiddenType:1,hiddenSources:1,hiddenInferred:1,hiddenSelf:1});
	});
	it('reveals secondary links explicitly and deduplicates nodes without dropping evidence', () => {
		const triples = [fact('source','papers/Graph.md'),fact('links_to','papers/Graph.md',true),fact('requires','papers/Graph.md')];
		const result = projectGraph(anchor,triples,['papers/Graph.md'],{showSources:true,showInferred:true});
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].relations.map(relation => relation.predicate)).toEqual(['requires','source','links_to']);
		expect(result.nodes[0].relations.flatMap(relation => relation.triples)).toHaveLength(3);
		expect(result.nodes[0]).toMatchObject({id:'papers/Graph.md',label:'Graph',context:'papers',resolved:true});
	});
	it('distinguishes duplicate compact names even across pages and labels unresolved links', () => {
		const result = projectGraph(anchor,[fact('requires','a/Topic.md'),fact('requires','b/Topic.md'),fact('requires','Missing')],['a/Topic.md','b/Topic.md'],{pageSize:1,page:1});
		expect(result.nodes[0]).toMatchObject({id:'b/Topic.md',label:'Topic',context:'b',resolved:true});
		expect(projectGraph(anchor,[fact('requires','Missing')],[]).nodes[0].resolved).toBe(false);
	});
	it('bounds neighbours and exposes truthful paging counts for highly connected notes', () => {
		const triples = Array.from({length:250},(_,i) => fact('requires',`notes/Topic ${i}.md`));
		const paths = triples.map(t => t.object);
		const first = projectGraph(anchor,triples,paths);
		const next = projectGraph(anchor,triples,paths,{page:1});
		expect(first.nodes).toHaveLength(12);
		expect(first.counts).toMatchObject({total:250,matching:250,shown:12,offPage:238});
		expect(first.pageCount).toBe(21);
		expect(next.nodes.some(node => first.nodes.some(previous => previous.id===node.id))).toBe(false);
		expect(projectGraph(anchor,triples,paths,{pageSize:1000}).nodes).toHaveLength(24);
		expect(projectGraph(anchor,triples,paths,{page:1000}).page).toBe(20);
	});
	it('filters nodes and their relation evidence, with stable eligible predicate options', () => {
		const triples = [fact('requires','a/Topic.md'),fact('enables','a/Topic.md'),fact('requires','b/Other.md')];
		const result = projectGraph(anchor,triples,[],{predicate:'enables',query:'a/topic'});
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].relations.map(relation => relation.predicate)).toEqual(['enables']);
		expect(result.predicates).toEqual(['requires','enables']);
		expect(result.counts).toMatchObject({matching:1,shown:1,filtered:1});
	});
	it('keeps explicit relation direction and never projects unrelated facts', () => {
		const result = projectGraph(anchor,[fact('enables',anchor,false,'Other.md'),fact('requires','Elsewhere.md',false,'Unrelated.md')],['Other.md']);
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0]).toMatchObject({id:'Other.md',relations:[{predicate:'enables',direction:'incoming'}]});
	});
});
