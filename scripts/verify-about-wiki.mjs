import assert from 'node:assert/strict';
import fs from 'node:fs';
import { moveItemById } from '../js/about-wiki-logic.mjs';

const aboutSource = fs.readFileSync(new URL('../js/about-wiki.js', import.meta.url), 'utf8');
const siteSource = fs.readFileSync(new URL('../js/site.js', import.meta.url), 'utf8');
const editorSource = fs.readFileSync(new URL('../js/markdown-editor.js', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(new URL('../pb_migrations/1785596400_expand_site_settings_value.js', import.meta.url), 'utf8');
const schema = JSON.parse(fs.readFileSync(new URL('../pb_schema.json', import.meta.url), 'utf8'));
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

const sections = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
check(moveItemById(sections, 'two', -1), 'a middle section can move up');
check(sections.map(section => section.id).join(',') === 'two,one,three', 'moving up changes section order');
check(moveItemById(sections, 'two', 1), 'the first section can move down');
check(sections.map(section => section.id).join(',') === 'one,two,three', 'moving down restores section order');
check(!moveItemById(sections, 'one', -1), 'the first section cannot move above the list');
check(!moveItemById(sections, 'three', 1), 'the last section cannot move below the list');

check(aboutSource.includes('data-section-id="${escapeAttribute(section.id)}" data-direction="-1"'), 'each section exposes its own move-up action');
check(aboutSource.includes('captureSelectedSectionDraft(state)'), 'reordering preserves an open editor draft');
check(aboutSource.includes('saveQueue: Promise.resolve()'), 'About saves must be serialized');
check(aboutSource.includes('data-version-refresh-block="${state.hasUnsavedChanges}"'), 'dirty About forms block version refresh');
check(aboutSource.includes("window.addEventListener('beforeunload'"), 'leaving a dirty About editor requires confirmation');
check(siteSource.includes('data-version-refresh-block="true"'), 'site refresh respects an unsaved editor');
check(editorSource.includes('adapter.options.onChange?.(adapter.currentHtml)'), 'the rich editor reports dirty changes');
check(migrationSource.includes('valueField.max = 5000000'), 'production migration expands the settings value limit');

const settings = schema.collections.find(collection => collection.name === 'site_settings');
const valueField = settings?.fields.find(field => field.name === 'value');
check(valueField?.max === 5000000, 'schema source of truth matches the expanded settings value limit');

console.log(`About wiki QA passed (${assertions} assertions).`);
