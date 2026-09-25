const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    module._compile(
        ts.transpileModule(source, {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
            },
        }).outputText,
        filename
    );
};

const {
    indexTree,
    copyBranch,
    pathTo,
    frameName,
    hotPath,
    descendants,
    expansionNodes,
    expansionForRoots,
    displayedUsage,
    frameCategory,
    visibleEntries,
    exportNodes,
} = require('../src/viewer/sampler/data/TreeNavigation.ts');
const SourceThreadVirtualNode =
    require('../src/viewer/sampler/node/SourceThreadVirtualNode.ts').default;

function node(name, time, children = [], owner) {
    return {
        getDetails: () =>
            name === 'thread'
                ? { type: 'thread', name }
                : {
                      type: 'stackTrace',
                      className: owner
                          ? 'org.example.Plugin'
                          : 'net.minecraft.Server',
                      methodName: name,
                      methodDesc: '()V',
                  },
        getSource: () => owner,
        getTime: () => time,
        getChildren: () => children,
        getParents: () => [],
    };
}

function fixture() {
    const leaf = node('plugin', 30, [], 'Example');
    const small = node('small', 5);
    const middle = node('tick', 40, [leaf, small]);
    const other = node('other', 40, [node('otherLeaf', 1)]);
    const entries = indexTree(
        [node('thread', 100, [middle, other])],
        n => n.getTime(),
        false,
        new Set(['example'])
    );
    return {
        entries,
        root: entries[0],
        middle: entries[1],
        leaf: entries[2],
        small: entries[3],
        other: entries[4],
    };
}

test('copy branch and complete path retain hierarchy and canonical usage', () => {
    const { root, middle, leaf } = fixture();
    assert.match(
        copyBranch(root),
        /  net\.minecraft\.Server\.tick\(\) - total: 40, self: 5/
    );
    assert.equal(
        pathTo(leaf).map(frameName).join(' > '),
        'thread > net.minecraft.Server.tick() > org.example.Plugin.plugin()'
    );
    assert.equal(middle.self, 5);
    assert.equal(root.self, 20);
});

test('hot path is deterministic in a tie and can start at a focused branch', () => {
    const { root, middle, leaf } = fixture();
    assert.deepEqual(hotPath(root).map(frameName), [
        frameName(root),
        frameName(middle),
        frameName(leaf),
    ]);
    assert.deepEqual(hotPath(middle).map(frameName), [
        frameName(middle),
        frameName(leaf),
    ]);
});

test('hiding, focus, threshold and search paths preserve required ancestors', () => {
    const { entries, root, middle, leaf, small, other } = fixture();
    const shown = (focus, hidden, threshold, query, pathsOnly, owner) => {
        const visible = visibleEntries(
            entries,
            focus,
            hidden,
            threshold,
            query,
            pathsOnly,
            owner
        );
        return entries.filter(entry => visible.has(entry)).map(frameName);
    };
    assert.deepEqual(shown(undefined, new Set(), 25, '', false), [
        frameName(root),
        frameName(middle),
        frameName(leaf),
        frameName(other),
    ]);
    assert.deepEqual(shown(middle, new Set(), 0, '', false), [
        frameName(middle),
        frameName(leaf),
        frameName(small),
    ]);
    assert.deepEqual(shown(undefined, new Set([middle]), 0, '', false), [
        frameName(root),
        frameName(other),
        frameName(entries[5]),
    ]);
    assert.deepEqual(shown(undefined, new Set(), 0, 'plugin', true), [
        frameName(root),
        frameName(middle),
        frameName(leaf),
    ]);
    assert.deepEqual(shown(undefined, new Set(), 0, '', false, 'Example'), [
        frameName(root),
        frameName(middle),
        frameName(leaf),
    ]);
});

test('recursive descendants and threshold expansion retain parent path', () => {
    const { root, middle, leaf, small } = fixture();
    assert.equal(descendants(middle).length, 2);
    assert.equal(descendants(root).length, 5);
    const threshold = 25;
    const expanded = expansionNodes(root, threshold);
    assert.deepEqual(expanded, [root, middle]);
    assert.deepEqual(pathTo(leaf), [root, middle, leaf]);
    assert.equal(descendants(middle).includes(small), true);
    assert.deepEqual(expansionNodes(middle), [middle]);
    const unusual = indexTree(
        [node('thread', 100, [node('bridge', 1, [node('heavy', 30)])])],
        n => n.getTime()
    );
    assert.deepEqual(expansionNodes(unusual[0], 20), unusual.slice(0, 2));
    const visible = visibleEntries(
        unusual,
        undefined,
        new Set(),
        20,
        '',
        false
    );
    assert.equal(
        unusual.every(entry => visible.has(entry)),
        true
    );
});

test('threshold filtering and expansion use the selected display unit', () => {
    const { entries, root, middle, leaf } = fixture();
    assert.equal(displayedUsage(middle), 40);
    assert.equal(displayedUsage(middle, true, 20), 2);
    assert.equal(displayedUsage(leaf, true, 20), 1.5);
    const visible = visibleEntries(
        entries,
        undefined,
        new Set(),
        2,
        '',
        false,
        undefined,
        entry => displayedUsage(entry, true, 20)
    );
    assert.equal(visible.has(root), true);
    assert.equal(visible.has(middle), true);
    assert.equal(visible.has(leaf), false);
    assert.deepEqual(expansionNodes(root, 2 * 20), [root]);
});

test('thread-scoped filters and expansion leave sibling threads unchanged', () => {
    const entries = indexTree(
        [
            node('thread', 100, [node('small', 10), node('large', 70)]),
            node('second thread', 100, [node('other', 10), node('larger', 70)]),
        ],
        n => n.getTime()
    );
    const first = entries[0];
    const second = entries[3];
    const visible = visibleEntries(
        entries,
        undefined,
        new Set(),
        0,
        '',
        false,
        undefined,
        undefined,
        entry => {
            let root = entry;
            while (root.parent) root = root.parent;
            return root === first ? 20 : 0;
        }
    );
    assert.equal(visible.has(entries[1]), false);
    assert.equal(visible.has(entries[4]), true);
    assert.equal(expansionNodes(first, 20).includes(second), false);
    assert.equal(hotPath(first).includes(second), false);
    assert.deepEqual(
        expansionForRoots([first, second], () => 0, 1),
        [first]
    );
    assert.deepEqual(expansionForRoots([second]), [second]);
    const chain = indexTree(
        [node('thread', 100, [node('tick', 80, [node('plugin', 60)])])],
        n => n.getTime()
    );
    assert.deepEqual(
        expansionForRoots([chain[0]], () => 0, 1),
        [chain[0]]
    );
    const resettable = visibleEntries(
        entries,
        undefined,
        new Set(),
        200,
        '',
        false,
        undefined,
        undefined,
        undefined,
        new Set([first])
    );
    assert.equal(resettable.has(first), true);
    assert.equal(resettable.has(second), false);
    assert.equal(resettable.has(entries[1]), false);
});

test('built-in owners do not become plugin frames', () => {
    assert.equal(
        frameCategory(node('tick', 10, [], 'Paper'), new Set(['example'])),
        undefined
    );
    assert.equal(
        frameCategory(node('plugin', 10, [], 'Example'), new Set(['example'])),
        'plugin'
    );
});

test('source thread roots do not claim self usage for an extracted subset', () => {
    const sourceRoot = new SourceThreadVirtualNode(
        { sources: { getSource: () => undefined } },
        {
            id: 1,
            name: 'thread',
            threadTime: 100,
            threadTimes: [100],
            sourceTime: 25,
            children: [],
        }
    );
    assert.equal(indexTree([sourceRoot], node => node.getTime())[0].self, null);
});

test('JSON scopes and category filtering preserve owner and original usage', () => {
    const { root, middle, leaf } = fixture();
    const full = exportNodes([root]);
    assert.equal(full[0].totalUsage, 100);
    assert.equal(full[0].children[0].selfUsage, 5);
    assert.equal(full[0].children[0].children[0].owner, 'Example');
    assert.equal(
        full[0].children[0].children[0].className,
        'org.example.Plugin'
    );
    assert.deepEqual(full[0].children[0].children[0].path, [
        frameName(root),
        frameName(middle),
        frameName(leaf),
    ]);
    assert.deepEqual(
        exportNodes([root], new Set(['plugin'])).map(entry => entry.frame),
        [frameName(leaf)]
    );
    assert.deepEqual(
        exportNodes([root], undefined, 'Example').map(entry => entry.frame),
        [frameName(leaf)]
    );
    assert.equal(exportNodes([middle])[0].frame, frameName(middle));
    assert.equal(exportNodes([root], new Set(['jvm'])).length, 0);
});
