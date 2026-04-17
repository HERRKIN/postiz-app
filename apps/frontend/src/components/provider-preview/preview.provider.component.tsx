'use client';
import 'reflect-metadata';
import { FC, MutableRefObject, useEffect, useMemo } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { Providers } from '@gitroom/frontend/components/new-launch/providers/show.all.providers';
import { getProviderSettingsMeta } from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import {
  IntegrationContext,
  type IntegrationContextType,
} from '@gitroom/frontend/components/launches/helpers/use.integration';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';

type MockIntegration = IntegrationContextType['integration'];

export type ProviderPreviewValidation = {
  isValid: boolean;
  value: Record<string, unknown>;
  errors: string[];
};

export type ProviderPreviewHandle = {
  getValues: () => Record<string, unknown>;
  validate: () => Promise<ProviderPreviewValidation>;
};

export type ProviderPreviewProps = {
  /** Provider identifier (e.g. "tiktok", "instagram", "youtube"). */
  provider: string;
  /** Initial settings value (shape matches the provider's DTO). */
  value?: Record<string, unknown>;
  /**
   * Called on every form change with the current settings value — for the
   * mobile WebView bridge this is what you postMessage back.
   */
  onChange?: (value: Record<string, unknown>) => void;
  /** Validator error messages from a previous failed save, rendered above the form. */
  errors?: string[];
  /**
   * Stub integration to feed the SettingsComponent via IntegrationContext.
   * Some providers (e.g. TikTok title) branch on `integration.additionalSettings`
   * or `value[0].image` — pass what you have, leave the rest to defaults.
   */
  integration?: Partial<MockIntegration>;
  /**
   * Imperative handle populated on mount. The parent calls
   * `controlRef.current?.validate()` / `.getValues()` to pull state on demand.
   */
  controlRef?: MutableRefObject<ProviderPreviewHandle | null>;
};

const DEFAULT_INTEGRATION: MockIntegration = {
  id: 'preview',
  name: 'Preview',
  identifier: '',
  picture: '',
  display: '',
  type: 'social',
  editor: 'normal' as const,
  disabled: false,
  inBetweenSteps: false,
  additionalSettings: '[]',
  changeProfilePicture: false,
  changeNickName: false,
  time: [] as { time: number }[],
};

/** Emits onChange whenever the form changes. Mounted inside FormProvider. */
const FormChangeEmitter: FC<{
  onChange?: (value: Record<string, unknown>) => void;
}> = ({ onChange }) => {
  const values = useWatch();
  useEffect(() => {
    if (onChange) onChange(values ?? {});
  }, [values, onChange]);
  return null;
};

const flattenFormErrors = (errs: unknown): string[] => {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (typeof n.message === 'string') out.push(n.message);
    if (n.types && typeof n.types === 'object') {
      for (const t of Object.values(n.types as Record<string, unknown>)) {
        if (typeof t === 'string') out.push(t);
      }
    }
    for (const [key, child] of Object.entries(n)) {
      if (['message', 'type', 'types', 'ref', 'root'].includes(key)) continue;
      walk(child);
    }
  };
  walk(errs);
  return out;
};

export const ProviderPreviewComponent: FC<ProviderPreviewProps> = ({
  provider,
  value,
  onChange,
  errors,
  integration,
  controlRef,
}) => {
  const meta = useMemo(() => {
    const entry = Providers.find((p) => p.identifier === provider);
    if (!entry) return null;
    return getProviderSettingsMeta(entry.component);
  }, [provider]);

  const form = useForm({
    resolver: meta?.dto ? classValidatorResolver(meta.dto) : undefined,
    defaultValues: value ?? {},
    values: value,
    mode: 'all',
    criteriaMode: 'all',
    reValidateMode: 'onChange',
  });

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      getValues: () => form.getValues() as Record<string, unknown>,
      validate: async () => {
        const isValid = await form.trigger(undefined, { shouldFocus: false });
        return {
          isValid,
          value: form.getValues() as Record<string, unknown>,
          errors: flattenFormErrors(form.formState.errors),
        };
      },
    };
    return () => {
      if (controlRef.current) controlRef.current = null;
    };
  }, [controlRef, form]);

  const contextValue = useMemo<IntegrationContextType>(
    () => ({
      date: newDayjs(),
      integration: {
        ...(DEFAULT_INTEGRATION as MockIntegration),
        identifier: provider,
        ...integration,
      } as MockIntegration,
      allIntegrations: [],
      value: [],
    }),
    [provider, integration],
  );

  if (!meta) {
    return <div>Provider &quot;{provider}&quot; not found</div>;
  }

  const { SettingsComponent } = meta;
  if (!SettingsComponent) {
    return (
      <div className="p-4 text-sm">
        This provider has no configurable settings.
      </div>
    );
  }

  return (
    <IntegrationContext.Provider value={contextValue}>
      <FormProvider {...form}>
        <div className="flex flex-col text-white">
          {errors && errors.length > 0 && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              <ul className="list-disc ps-5">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <FormChangeEmitter onChange={onChange} />
          <SettingsComponent />
        </div>
      </FormProvider>
    </IntegrationContext.Provider>
  );
};
