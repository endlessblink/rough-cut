# Rendering default policy

Preview renderer selection and export backend selection are separate policies.
The preview may select WebGPU with fallback; it does not enable experimental export.

Raw export remains the normalized default. Styled export is available explicitly.
Experimental headless export remains opt-in and requires
`ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT=1`. The UI flag alone does not enable it.

A future default change requires a true Electron-runtime benchmark and representative
styled parity proof. Do not claim the runtime export is faster without that evidence.
Historical private task notes are not a runtime dependency or a public acceptance gate.
