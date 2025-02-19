import {
  addApiWithBlankSchemaAndConflictDetection,
  amplifyPush,
  amplifyPushUpdate,
  apiDisableDataStore,
  createNewProjectDir,
  deleteProject,
  deleteProjectDir,
  getAppSyncApi,
  getProjectMeta,
  getTransformConfig,
  initJSProjectWithProfile,
  updateApiSchema,
} from '@aws-amplify/amplify-e2e-core';
import AWSAppSyncClient, {
  AUTH_TYPE,
} from 'aws-appsync';
import {
  existsSync,
} from 'fs';
import gql from 'graphql-tag';
import {
  TRANSFORM_CURRENT_VERSION,
} from 'graphql-transformer-core';
import _ from 'lodash';
import * as path from 'path';

const providerName = 'awscloudformation';

// to deal with bug in cognito-identity-js
(global as any).fetch = require('node-fetch');
// to deal with subscriptions in node env
(global as any).WebSocket = require('ws');

describe('amplify add api (GraphQL)', () => {
  let projRoot: string;
  beforeEach(async () => {
    projRoot = await createNewProjectDir('graphql-api');
  });

  afterEach(async () => {
    const metaFilePath = path.join(projRoot, 'amplify', '#current-cloud-backend', 'amplify-meta.json');
    if (existsSync(metaFilePath)) {
      await deleteProject(projRoot);
    }
    deleteProjectDir(projRoot);
  });

  it('init a project with conflict detection enabled and a schema with @key, test update mutation', async () => {
    // eslint-disable-next-line spellcheck/spell-checker
    const name = 'keyconflictdetection';
    await initJSProjectWithProfile(projRoot, { name });
    await addApiWithBlankSchemaAndConflictDetection(projRoot, { transformerVersion: 1 });
    await updateApiSchema(projRoot, name, 'key-conflict-detection.graphql');
    await amplifyPush(projRoot);

    const meta = getProjectMeta(projRoot);
    const region = meta.providers[providerName].Region as string;
    const { output } = meta.api[name];
    const url = output.GraphQLAPIEndpointOutput as string;
    const apiKey = output.GraphQLAPIKeyOutput as string;

    const appSyncClient = new AWSAppSyncClient({
      url,
      region,
      disableOffline: true,
      auth: {
        type: AUTH_TYPE.API_KEY,
        apiKey,
      },
    });

    const createMutation = /* GraphQL */ `
      mutation CreateNote($input: CreateNoteInput!, $condition: ModelNoteConditionInput) {
        createNote(input: $input, condition: $condition) {
          noteId
          note
          _version
          _deleted
          _lastChangedAt
          createdAt
          updatedAt
        }
      }
    `;
    const createInput = {
      input: {
        noteId: '1',
        note: 'initial note',
      },
    };
    const createResult: any = await appSyncClient.mutate({
      mutation: gql(createMutation),
      fetchPolicy: 'no-cache',
      variables: createInput,
    });

    const updateMutation = /* GraphQL */ `
      mutation UpdateNote($input: UpdateNoteInput!, $condition: ModelNoteConditionInput) {
        updateNote(input: $input, condition: $condition) {
          noteId
          note
          _version
          _deleted
          _lastChangedAt
          createdAt
          updatedAt
        }
      }
    `;
    const createResultData = createResult.data as any;
    const updateInput = {
      input: {
        noteId: createResultData.createNote.noteId,
        note: 'note updated',
        _version: createResultData.createNote._version,
      },
    };

    const updateResult: any = await appSyncClient.mutate({
      mutation: gql(updateMutation),
      fetchPolicy: 'no-cache',
      variables: updateInput,
    });
    const updateResultData = updateResult.data as any;

    expect(updateResultData).toBeDefined();
    expect(updateResultData.updateNote).toBeDefined();
    expect(updateResultData.updateNote.noteId).toEqual(createResultData.createNote.noteId);
    expect(updateResultData.updateNote.note).not.toEqual(createResultData.createNote.note);
    expect(updateResultData.updateNote._version).not.toEqual(createResultData.createNote._version);
    expect(updateResultData.updateNote.note).toEqual(updateInput.input.note);
  });

  it('init a project with conflict detection enabled and toggle disable', async () => {
    // eslint-disable-next-line spellcheck/spell-checker
    const name = 'conflictdetection';
    await initJSProjectWithProfile(projRoot, { name });
    await addApiWithBlankSchemaAndConflictDetection(projRoot, { transformerVersion: 1 });
    await updateApiSchema(projRoot, name, 'simple_model.graphql');

    await amplifyPush(projRoot);

    const meta = getProjectMeta(projRoot);
    const { output } = meta.api[name];
    const { GraphQLAPIIdOutput, GraphQLAPIEndpointOutput, GraphQLAPIKeyOutput } = output;
    const { graphqlApi } = await getAppSyncApi(GraphQLAPIIdOutput, meta.providers.awscloudformation.Region);

    expect(GraphQLAPIIdOutput).toBeDefined();
    expect(GraphQLAPIEndpointOutput).toBeDefined();
    expect(GraphQLAPIKeyOutput).toBeDefined();

    expect(graphqlApi).toBeDefined();
    expect(graphqlApi.apiId).toEqual(GraphQLAPIIdOutput);

    const transformConfig = getTransformConfig(projRoot, name);
    expect(transformConfig).toBeDefined();
    expect(transformConfig.Version).toBeDefined();
    expect(transformConfig.Version).toEqual(TRANSFORM_CURRENT_VERSION);
    expect(transformConfig.ResolverConfig).toBeDefined();
    expect(transformConfig.ResolverConfig.project).toBeDefined();
    expect(transformConfig.ResolverConfig.project.ConflictDetection).toEqual('VERSION');
    expect(transformConfig.ResolverConfig.project.ConflictHandler).toEqual('AUTOMERGE');

    // remove DataStore feature
    await apiDisableDataStore(projRoot, {});
    await amplifyPushUpdate(projRoot, undefined, false, false, 1000 * 60 * 45 /* 45 minutes */);
    const disableDSConfig = getTransformConfig(projRoot, name);
    expect(disableDSConfig).toBeDefined();
    expect(_.isEmpty(disableDSConfig.ResolverConfig)).toBe(true);
  });

});
