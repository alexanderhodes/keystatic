import { useRouter } from './router';
import {
  FormEvent,
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Badge } from '@keystar/ui/badge';
import { Button } from '@keystar/ui/button';
import { DialogContainer } from '@keystar/ui/dialog';
import { Flex } from '@keystar/ui/layout';
import { Notice } from '@keystar/ui/notice';
import { ProgressCircle } from '@keystar/ui/progress';
import { Heading, Text } from '@keystar/ui/typography';

import { Config } from '../config';
import { createGetPreviewProps } from '../form/preview-props';
import { fields } from '../form/api';
import { clientSideValidateProp } from '../form/errors';
import { getInitialPropsValue } from '../form/initial-values';
import { useEventCallback } from '../form/fields/document/DocumentEditor/ui-utils';
import {
  getDataFileExtension,
  getPathPrefix,
  getRepoUrl,
  getSingletonFormat,
  getSingletonPath,
  isCloudConfig,
  isGitHubConfig,
} from './utils';

import { CreateBranchDuringUpdateDialog } from './ItemPage';
import { PageBody, PageHeader, PageRoot } from './shell/page';
import { useBaseCommit, useBranchInfo } from './shell/data';
import { useHasChanged } from './useHasChanged';
import { parseEntry, useItemData } from './useItemData';
import { serializeEntryToFiles, useUpsertItem } from './updating';
import { Icon } from '@keystar/ui/icon';
import { ForkRepoDialog } from './fork-repo';
import { FormForEntry, containerWidthForEntryLayout } from './entry-form';
import { notFound } from './not-found';
import {
  delDraft,
  getDraft,
  setDraft,
  showDraftRestoredToast,
} from './persistence';
import { z } from 'zod';
import { LOADING, useData } from './useData';
import { ActionGroup, Item } from '@keystar/ui/action-group';
import { useMediaQuery, breakpointQueries } from '@keystar/ui/style';
import { githubIcon } from '@keystar/ui/icon/icons/githubIcon';
import { externalLinkIcon } from '@keystar/ui/icon/icons/externalLinkIcon';
import { historyIcon } from '@keystar/ui/icon/icons/historyIcon';
import { getYjsValFromParsedValue } from '../form/props-value';
import * as Y from 'yjs';
import { useYjs, useYjsIfAvailable } from './shell/collab';
import { createGetPreviewPropsFromY } from '../form/preview-props-yjs';
import { useYJsValue } from './useYJsValue';

type SingletonPageProps = {
  singleton: string;
  config: Config;
  initialState: Record<string, unknown> | null;
  initialFiles: string[];
  localTreeKey: string | undefined;
};

function SingletonPageInner(
  props: SingletonPageProps & {
    updateResult: ReturnType<typeof useUpsertItem>[0];
    onUpdate: ReturnType<typeof useUpsertItem>[1];
    onResetUpdateItem: ReturnType<typeof useUpsertItem>[2];
    hasChanged: boolean;
    state: Record<string, unknown>;
    onReset: () => void;
    previewProps: ReturnType<ReturnType<typeof createGetPreviewProps>>;
  }
) {
  const isBelowTablet = useMediaQuery(breakpointQueries.below.tablet);
  const singletonConfig = props.config.singletons![props.singleton]!;
  const branchInfo = useBranchInfo();
  const [forceValidation, setForceValidation] = useState(false);

  const schema = useMemo(
    () => fields.object(singletonConfig.schema),
    [singletonConfig.schema]
  );

  const router = useRouter();

  const previewHref = useMemo(() => {
    if (!singletonConfig.previewUrl) return undefined;
    return singletonConfig.previewUrl.replace(
      '{branch}',
      branchInfo.currentBranch
    );
  }, [branchInfo.currentBranch, singletonConfig.previewUrl]);
  const isGitHub = isGitHubConfig(props.config) || isCloudConfig(props.config);
  const formatInfo = getSingletonFormat(props.config, props.singleton);
  const singletonExists = !!props.initialState;
  const singletonPath = getSingletonPath(props.config, props.singleton);

  const viewHref =
    isGitHub && singletonExists
      ? `${getRepoUrl(branchInfo)}${
          formatInfo.dataLocation === 'index'
            ? `/tree/${branchInfo.currentBranch}/${
                getPathPrefix(props.config.storage) ?? ''
              }${singletonPath}`
            : `/blob/${getPathPrefix(props.config.storage) ?? ''}${
                branchInfo.currentBranch
              }/${singletonPath}${getDataFileExtension(formatInfo)}`
        }`
      : undefined;

  const menuActions = useMemo(() => {
    const actions: {
      key: string;
      label: string;
      icon: ReactElement;
      href?: string;
      target?: string;
      rel?: string;
    }[] = [
      {
        key: 'reset',
        label: 'Reset',
        icon: historyIcon,
      },
    ];
    if (previewHref) {
      actions.push({
        key: 'preview',
        label: 'Preview',
        icon: externalLinkIcon,
        href: previewHref,
        target: '_blank',
        rel: 'noopener noreferrer',
      });
    }
    if (viewHref) {
      actions.push({
        key: 'view',
        label: 'View on GitHub',
        icon: githubIcon,
        href: viewHref,
        target: '_blank',
        rel: 'noopener noreferrer',
      });
    }
    return actions;
  }, [previewHref, viewHref]);

  const formID = 'singleton-form';

  const baseCommit = useBaseCommit();

  const isCreating = props.initialState === null;

  const onCreate = async () => {
    if (props.updateResult.kind === 'loading' || !props.hasChanged) return;
    if (!clientSideValidateProp(schema, props.state, undefined)) {
      setForceValidation(true);
      return;
    }
    await props.onUpdate();
  };

  return (
    <PageRoot containerWidth={containerWidthForEntryLayout(singletonConfig)}>
      <PageHeader>
        <Flex flex alignItems="center" gap="regular">
          <Heading elementType="h1" id="page-title" size="small">
            {singletonConfig.label}
          </Heading>
          {props.updateResult.kind === 'loading' ? (
            <ProgressCircle
              aria-label={`Updating ${singletonConfig.label}`}
              isIndeterminate
              size="small"
              alignSelf="center"
            />
          ) : (
            props.hasChanged && <Badge tone="pending">Unsaved</Badge>
          )}
        </Flex>
        <ActionGroup
          buttonLabelBehavior="hide"
          overflowMode="collapse"
          prominence="low"
          density="compact"
          maxWidth={isBelowTablet ? 'element.regular' : undefined} // force switch to action menu on small devices
          items={menuActions}
          disabledKeys={props.hasChanged ? [] : ['reset']}
          onAction={key => {
            switch (key) {
              case 'reset':
                props.onReset();
                break;
            }
          }}
        >
          {item => (
            <Item
              key={item.key}
              textValue={item.label}
              href={item.href}
              target={item.target}
              rel={item.rel}
            >
              <Icon src={item.icon} />
              <Text>{item.label}</Text>
            </Item>
          )}
        </ActionGroup>
        <Button
          form={formID}
          isDisabled={props.updateResult.kind === 'loading'}
          prominence="high"
          type="submit"
        >
          {isCreating ? 'Create' : 'Save'}
        </Button>
      </PageHeader>
      <Flex
        elementType="form"
        id={formID}
        onSubmit={(event: FormEvent) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          onCreate();
        }}
        direction="column"
        gap="xxlarge"
        height="100%"
        minHeight={0}
        minWidth={0}
      >
        {props.updateResult.kind === 'error' && (
          <Notice tone="critical">{props.updateResult.error.message}</Notice>
        )}
        <FormForEntry
          previewProps={props.previewProps as any}
          forceValidation={forceValidation}
          entryLayout={singletonConfig.entryLayout}
          formatInfo={formatInfo}
          slugField={undefined}
        />
        <DialogContainer
          // ideally this would be a popover on desktop but using a DialogTrigger wouldn't work since
          // this doesn't open on click but after doing a network request and it failing and manually wiring about a popover and modal would be a pain
          onDismiss={props.onResetUpdateItem}
        >
          {props.updateResult.kind === 'needs-new-branch' && (
            <CreateBranchDuringUpdateDialog
              branchOid={baseCommit}
              onCreate={async newBranch => {
                router.push(
                  `/keystatic/branch/${encodeURIComponent(
                    newBranch
                  )}/singleton/${encodeURIComponent(props.singleton)}`
                );
                props.onUpdate({ branch: newBranch, sha: baseCommit });
              }}
              reason={props.updateResult.reason}
              onDismiss={props.onResetUpdateItem}
            />
          )}
        </DialogContainer>
        <DialogContainer
          // ideally this would be a popover on desktop but using a DialogTrigger
          // wouldn't work since this doesn't open on click but after doing a
          // network request and it failing and manually wiring about a popover
          // and modal would be a pain
          onDismiss={props.onResetUpdateItem}
        >
          {props.updateResult.kind === 'needs-fork' &&
            isGitHubConfig(props.config) && (
              <ForkRepoDialog
                onCreate={async () => {
                  props.onUpdate();
                }}
                onDismiss={props.onResetUpdateItem}
                config={props.config}
              />
            )}
        </DialogContainer>
      </Flex>
    </PageRoot>
  );
}

function LocalSingletonPage(
  props: SingletonPageProps & {
    draft:
      | {
          state: Record<string, unknown>;
          savedAt: Date;
          treeKey: string | undefined;
        }
      | undefined;
  }
) {
  const { singleton, initialFiles, initialState, localTreeKey, config, draft } =
    props;
  const singletonConfig = config.singletons![singleton]!;
  const schema = useMemo(
    () => fields.object(singletonConfig.schema),
    [singletonConfig.schema]
  );
  const singletonPath = getSingletonPath(config, singleton);

  const [{ state, localTreeKey: localTreeKeyInState }, setState] = useState(
    () => ({
      localTreeKey: localTreeKey,
      state:
        draft?.state ??
        (initialState === null ? getInitialPropsValue(schema) : initialState),
    })
  );
  useEffect(() => {
    if (draft && state === draft.state) {
      showDraftRestoredToast(draft.savedAt, localTreeKey !== draft.treeKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (localTreeKeyInState !== localTreeKey) {
    setState({
      localTreeKey: localTreeKey,
      state:
        initialState === null ? getInitialPropsValue(schema) : initialState,
    });
  }

  const isCreating = initialState === null;
  const hasChanged =
    useHasChanged({ initialState, state, schema, slugField: undefined }) ||
    isCreating;

  useEffect(() => {
    const key = ['singleton', singleton] as const;
    if (hasChanged) {
      const serialized = serializeEntryToFiles({
        basePath: singletonPath,
        config,
        format: getSingletonFormat(config, singleton),
        schema: singletonConfig.schema,
        slug: undefined,
        state,
      });
      const files = new Map(serialized.map(x => [x.path, x.contents]));
      const data: z.infer<typeof storedValSchema> = {
        beforeTreeKey: localTreeKey,
        files,
        savedAt: new Date(),
        version: 1,
      };
      setDraft(key, data);
    } else {
      delDraft(key);
    }
  }, [
    config,
    localTreeKey,
    state,
    hasChanged,
    singleton,
    singletonPath,
    singletonConfig,
  ]);

  const previewProps = useMemo(
    () =>
      createGetPreviewProps(
        schema,
        stateUpdater => {
          setState(state => ({
            localTreeKey: state.localTreeKey,
            state: stateUpdater(state.state),
          }));
        },
        () => undefined
      ),
    [schema]
  )(state as Record<string, unknown>);

  const formatInfo = getSingletonFormat(config, singleton);
  const [updateResult, _update, resetUpdateItem] = useUpsertItem({
    state,
    initialFiles,
    config,
    schema: singletonConfig.schema,
    basePath: singletonPath,
    format: formatInfo,
    currentLocalTreeKey: localTreeKey,
    slug: undefined,
  });
  const update = useEventCallback(_update);

  const onReset = () =>
    setState({
      localTreeKey: localTreeKey,
      state:
        initialState === null ? getInitialPropsValue(schema) : initialState,
    });
  return (
    <SingletonPageInner
      {...props}
      hasChanged={hasChanged}
      onReset={onReset}
      onUpdate={update}
      onResetUpdateItem={resetUpdateItem}
      updateResult={updateResult}
      state={state}
      previewProps={previewProps}
    />
  );
}

function CollabSingletonPage(
  props: SingletonPageProps & {
    map: Y.Map<unknown>;
  }
) {
  const { singleton, initialFiles, initialState, localTreeKey, config } = props;
  const singletonConfig = config.singletons![singleton]!;
  const schema = useMemo(
    () => fields.object(singletonConfig.schema),
    [singletonConfig.schema]
  );
  const singletonPath = getSingletonPath(config, singleton);

  const yjsInfo = useYjs();
  const state = useYJsValue(schema, props.map) as Record<string, unknown>;
  const previewProps = useMemo(
    () =>
      createGetPreviewPropsFromY(schema as any, props.map, yjsInfo.awareness),
    [props.map, schema, yjsInfo.awareness]
  )(state);

  const isCreating = initialState === null;
  const hasChanged =
    useHasChanged({ initialState, state, schema, slugField: undefined }) ||
    isCreating;

  const formatInfo = getSingletonFormat(config, singleton);
  const [updateResult, _update, resetUpdateItem] = useUpsertItem({
    state,
    initialFiles,
    config,
    schema: singletonConfig.schema,
    basePath: singletonPath,
    format: formatInfo,
    currentLocalTreeKey: localTreeKey,
    slug: undefined,
  });
  const update = useEventCallback(_update);

  const onReset = async () => {
    props.map.doc!.transact(() => {
      for (const [key, value] of Object.entries(singletonConfig.schema)) {
        const val = getYjsValFromParsedValue(
          value,
          props.initialState?.[key] ?? getInitialPropsValue(value)
        );
        props.map.set(key, val);
      }
    });
    await props.map.doc?.whenSynced;
    // TODO: fix the need for this
    window.location.reload();
  };
  return (
    <SingletonPageInner
      {...props}
      hasChanged={hasChanged}
      onReset={onReset}
      onUpdate={update}
      onResetUpdateItem={resetUpdateItem}
      updateResult={updateResult}
      state={state}
      previewProps={previewProps}
    />
  );
}

const storedValSchema = z.object({
  version: z.literal(1),
  savedAt: z.date(),
  beforeTreeKey: z.string().optional(),
  files: z.map(z.string(), z.instanceof(Uint8Array)),
});

function SingletonPageWrapper(props: { singleton: string; config: Config }) {
  const singletonConfig = props.config.singletons?.[props.singleton];
  if (!singletonConfig) notFound();
  const header = (
    <PageHeader>
      <Heading elementType="h1" id="page-title" size="small">
        {singletonConfig.label}
      </Heading>
    </PageHeader>
  );
  const format = useMemo(
    () => getSingletonFormat(props.config, props.singleton),
    [props.config, props.singleton]
  );

  const dirpath = getSingletonPath(props.config, props.singleton);

  const draftData = useData(
    useCallback(async () => {
      const raw = await getDraft(['singleton', props.singleton]);
      if (!raw) throw new Error('No draft found');
      const stored = storedValSchema.parse(raw);
      const parsed = parseEntry(
        {
          config: props.config,
          dirpath,
          format,
          schema: singletonConfig.schema,
          slug: undefined,
        },
        stored.files
      );
      return {
        state: parsed.initialState,
        savedAt: stored.savedAt,
        treeKey: stored.beforeTreeKey,
      };
    }, [dirpath, format, props.config, props.singleton, singletonConfig.schema])
  );

  const itemData = useItemData({
    config: props.config,
    dirpath,
    schema: singletonConfig.schema,
    format,
    slug: undefined,
  });
  const branchInfo = useBranchInfo();

  const key = `${branchInfo.currentBranch}/${props.singleton}`;

  const yjsInfo = useYjsIfAvailable();

  const mapData = useData(
    useCallback(async () => {
      if (!yjsInfo) return;
      if (yjsInfo === 'loading') return LOADING;
      await yjsInfo.doc.whenSynced;
      if (itemData.kind !== 'loaded') return LOADING;
      let doc = yjsInfo.data.get(key);
      if (doc instanceof Y.Doc) {
        const promise = doc.whenLoaded;
        doc.load();
        await promise;
      } else {
        doc = new Y.Doc();
        yjsInfo.data.set(key, doc);
      }
      const data = doc.getMap('data');
      if (!data.size) {
        doc.transact(() => {
          for (const [key, value] of Object.entries(singletonConfig.schema)) {
            const val = getYjsValFromParsedValue(
              value,
              itemData.data === 'not-found'
                ? getInitialPropsValue(value)
                : itemData.data.initialState[key]
            );
            data.set(key, val);
          }
        });
      }
      return data;
    }, [singletonConfig, itemData, key, yjsInfo])
  );
  if (itemData.kind === 'error') {
    return (
      <PageRoot>
        {header}
        <PageBody>
          <Notice margin="xxlarge" tone="critical">
            {itemData.error.message}
          </Notice>
        </PageBody>
      </PageRoot>
    );
  }

  if (mapData.kind === 'error') {
    return (
      <PageRoot>
        {header}
        <PageBody>
          <Notice margin="xxlarge" tone="critical">
            {mapData.error.message}
          </Notice>
        </PageBody>
      </PageRoot>
    );
  }

  if (
    itemData.kind === 'loading' ||
    draftData.kind === 'loading' ||
    mapData.kind === 'loading'
  ) {
    return (
      <PageRoot>
        {header}
        <PageBody>
          <Flex
            alignItems="center"
            justifyContent="center"
            minHeight="scale.3000"
          >
            <ProgressCircle
              aria-label={`Loading ${singletonConfig.label}`}
              isIndeterminate
              size="large"
            />
          </Flex>
        </PageBody>
      </PageRoot>
    );
  }

  if (mapData.data) {
    return (
      <CollabSingletonPage
        singleton={props.singleton}
        config={props.config}
        initialState={
          itemData.data === 'not-found' ? null : itemData.data.initialState
        }
        initialFiles={
          itemData.data === 'not-found' ? [] : itemData.data.initialFiles
        }
        localTreeKey={
          itemData.data === 'not-found' ? undefined : itemData.data.localTreeKey
        }
        map={mapData.data}
      />
    );
  }

  return (
    <LocalSingletonPage
      singleton={props.singleton}
      config={props.config}
      initialState={
        itemData.data === 'not-found' ? null : itemData.data.initialState
      }
      initialFiles={
        itemData.data === 'not-found' ? [] : itemData.data.initialFiles
      }
      localTreeKey={
        itemData.data === 'not-found' ? undefined : itemData.data.localTreeKey
      }
      draft={draftData.kind === 'loaded' ? draftData.data : undefined}
    />
  );
}

export { SingletonPageWrapper as SingletonPage };
