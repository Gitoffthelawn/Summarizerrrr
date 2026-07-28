<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import SkillList from '@/entrypoints/prompt/components/SkillList.svelte'
  import PlusIcon from '@/components/icons/PlusIcon.svelte'
  import TextScramble from '@/lib/utils/textScramble.js'
  import { skillService, createUserSkill } from '@/lib/chat/skills/skillService.js'
  import { settings } from '@/stores/settingsStore.svelte.js'

  let { onBack } = $props()

  let selectedId = $state(null)
  let creating = $state(false)
  let draft = $state(null)
  let baseline = $state(null)
  let errors = $state([])

  let skills = $derived(skillService.listSkills(settings))

  const fieldClass =
    'relative z-10 bg-white dark:bg-surface-1 border border-border w-full p-2 rounded-lg outline-0 shadow-[0_0_0_0_var(--color-border)] focus:shadow-[0_0_0_3px_var(--color-border)] transition-shadow focus:border-muted/60 text-text-primary'

  let isModified = $derived(
    !!baseline &&
      !!draft &&
      (draft.name !== baseline.name ||
        draft.instruction !== baseline.instruction ||
        draft.pinned !== baseline.pinned),
  )

  function loadSkill(skill) {
    if (!skill) {
      draft = null
      baseline = null
      errors = []
      return
    }
    draft = { ...skill }
    baseline = { ...skill }
    errors = []
  }

  // Sync the editor with the selected skill (skip while composing a new one).
  $effect(() => {
    if (creating) return
    const skill = skills.find((s) => s.id === selectedId) || skills[0] || null
    if (skill) {
      if (!selectedId) selectedId = skill.id
      if (!draft || draft.id !== skill.id) loadSkill(skill)
    } else {
      loadSkill(null)
    }
  })

  // Scramble the skill title like the prompt editor.
  let ts = null
  $effect(() => {
    const name = draft?.name
    const el = document.querySelector('#skill-scramble-title')
    if (!el) return
    if (!ts) ts = new TextScramble(el)
    ts.setText(name || 'New skill')
  })

  function selectSkill(id) {
    creating = false
    selectedId = id
  }

  function newSkill() {
    creating = true
    selectedId = null
    const blank = createUserSkill({
      name: '',
      instruction: '',
    })
    draft = { ...blank }
    baseline = { ...blank }
    errors = []
  }

  async function saveSkill() {
    const result = await skillService.saveSkill(draft, settings)
    errors = result?.errors || []
    if (result?.valid) {
      creating = false
      selectedId = result.value.id
      loadSkill(result.value)
    }
  }

  function discardChanges() {
    if (baseline) loadSkill({ ...baseline })
  }

  async function deleteSkill() {
    if (!draft) return
    await skillService.deleteSkill(draft.id, settings)
    creating = false
    selectedId = skillService.listSkills(settings)[0]?.id || null
    draft = null
  }

  async function resetBuiltIn() {
    if (!draft) return
    await skillService.resetBuiltIn(draft.id, settings)
    creating = false
    const fresh = skillService.listSkills(settings).find((s) => s.id === draft.id)
    loadSkill(fresh || null)
  }
</script>

<main
  class="flex font-mono text-xs 2xl:text-sm relative p-8 min-w-4xl min-h-dvh bg-background text-text-primary"
>
  <span
    class="absolute z-10 h-full min-h-lvh w-px bg-border/70 top-0 -translate-x-px left-8"
  ></span>
  <span
    class="absolute z-10 h-full min-h-lvh w-px bg-border/70 top-0 translate-x-px right-8"
  ></span>
  <span
    class="absolute z-20 h-full min-h-lvh w-px bg-border/70 top-0 -translate-x-px left-64"
  ></span>
  <span
    class="absolute z-10 h-px w-full min-w-lvw bg-border/70 top-8 -translate-y-px left-0"
  ></span>
  <span
    class="absolute z-10 h-px w-full min-w-lvw bg-border/70 bottom-8 translate-y-px left-0"
  ></span>

  <!-- Left Column: Skill Menu -->
  <SkillList
    {skills}
    {selectedId}
    onSelect={selectSkill}
    onCreate={newSkill}
    {onBack}
  />

  <!-- Right Column: Skill Editor -->
  <div
    class="flex-1 relative z-20 bg-white dark:bg-surface-1 p-4 flex flex-col gap-2"
  >
    <PlusIcon />
    {#if draft}
      <div class="flex items-start justify-between gap-4 mb-2">
        <div>
          <h2 class="text-lg font-bold" id="skill-scramble-title">
            {draft.name || 'New skill'}
          </h2>
          <p class="text-text-secondary mt-1">
            {draft.builtIn
              ? 'Editing a built-in creates a recoverable override.'
              : 'User skill'}
          </p>
        </div>
        <label
          class="flex shrink-0 items-center gap-2 text-text-secondary cursor-pointer select-none"
        >
          <input type="checkbox" bind:checked={draft.pinned} />
          Pin
        </label>
      </div>

      {#each errors as error}
        <p class="rounded-lg bg-error/10 border border-error/20 px-3 py-2 text-error">
          {error}
        </p>
      {/each}

      <div class="flex flex-col pt-6 gap-2 relative">
        <label
          for="skill-name"
          class="text-text-secondary bg-blackwhite/5 rounded-t-lg top-0 px-2 pt-1 pb-5 absolute w-fit"
          >Name</label
        >
        <input id="skill-name" class={fieldClass} bind:value={draft.name} />
      </div>

      <div class="flex flex-col h-full pt-6 gap-2 min-h-48 relative">
        <label
          for="skill-instruction"
          class="text-text-secondary bg-blackwhite/5 rounded-t-lg top-0 px-2 pt-1 pb-5 absolute w-fit"
          >One-shot instruction</label
        >
        <div class="text-text-secondary absolute top-0 right-0">
          Applied to a single turn only
        </div>
        <textarea
          id="skill-instruction"
          class="{fieldClass} h-full mb-2 leading-normal"
          bind:value={draft.instruction}
          placeholder=""
        ></textarea>
      </div>

      <div class="flex justify-between gap-2 mt-auto">
        <div class="flex gap-2 items-center">
          {#if draft.builtIn}
            <button class="relative overflow-hidden group" onclick={resetBuiltIn}>
              <div
                class="font-medium py-2 px-4 border transition-colors duration-200 bg-surface-2 group-hover:bg-surface-2/95 text-text-secondary border-border hover:border-gray-500/50 hover:text-text-primary dark:hover:text-white"
              >
                Reset built-in
              </div>
              <span
                class="size-4 absolute z-10 -left-2 -bottom-2 border bg-white dark:bg-surface-1 rotate-45 transition-colors duration-200 border-border group-hover:border-gray-500"
              ></span>
            </button>
          {:else}
            <button class="relative overflow-hidden group" onclick={deleteSkill}>
              <div
                class="font-medium py-2 px-4 border transition-colors duration-200 bg-white dark:bg-surface-1 text-error/90 border-error/30 hover:border-error/60 hover:text-error"
              >
                Delete
              </div>
              <span
                class="size-4 absolute z-10 -left-2 -bottom-2 border bg-white dark:bg-surface-1 rotate-45 transition-colors duration-200 border-error/30 group-hover:border-error/60"
              ></span>
            </button>
          {/if}
        </div>

        <div class="flex gap-2 items-center">
          <button
            class="relative overflow-hidden group"
            onclick={discardChanges}
            disabled={!isModified}
          >
            <div
              class="font-medium py-2 px-4 border transition-colors duration-200 {isModified
                ? 'bg-surface-2 group-hover:bg-surface-2/95 text-text-secondary border-border hover:border-gray-500/50 hover:text-text-primary dark:hover:text-white'
                : 'bg-white dark:bg-surface-1 text-text-secondary border-border/40'}"
            >
              Discard
            </div>
            <span
              class="size-4 absolute z-10 -left-2 -bottom-2 border bg-white dark:bg-surface-1 rotate-45 transition-colors duration-200 {isModified
                ? 'border-border group-hover:border-gray-500'
                : 'border-border/40'}"
            ></span>
          </button>
          <button
            class="flex relative overflow-hidden group"
            onclick={saveSkill}
            disabled={!isModified}
          >
            <div
              class="font-medium py-2 px-4 border transition-colors duration-200 {isModified
                ? 'bg-primary group-hover:bg-primary/95 dark:group-hover:bg-orange-500 text-orange-50 dark:text-orange-100/90 border-orange-400 hover:border-orange-300/75 hover:text-white'
                : 'bg-white dark:bg-surface-1 text-text-secondary border-border/40'}"
            >
              Save
            </div>
            <span
              class="size-4 absolute z-10 -left-2 -bottom-2 border bg-white dark:bg-surface-1 rotate-45 transition-colors duration-200 {isModified
                ? 'border-orange-400 group-hover:border-orange-300/75'
                : 'border-border/40'}"
            ></span>
          </button>
        </div>
      </div>
    {:else}
      <p class="text-text-secondary">
        Select a skill from the menu on the left, or create a new one.
      </p>
    {/if}
  </div>
</main>
