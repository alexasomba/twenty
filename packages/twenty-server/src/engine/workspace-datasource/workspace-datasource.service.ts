import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { msg } from '@lingui/core/macro';
import { type DataSource, type EntityManager } from 'typeorm';

import { isD1Environment } from 'src/database/typeorm/d1/is-d1-environment.util';
import { DataSourceService } from 'src/engine/metadata-modules/data-source/data-source.service';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

@Injectable()
export class WorkspaceDataSourceService {
  constructor(
    private readonly dataSourceService: DataSourceService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {}

  public async checkSchemaExists(workspaceId: string) {
    const dataSource =
      await this.dataSourceService.getDataSourcesMetadataFromWorkspaceId(
        workspaceId,
      );

    return dataSource.length > 0;
  }

  /**
   *
   * Create a new DB schema for a workspace
   *
   * For D1/SQLite: No-op (uses single DB with workspaceId column scoping)
   * For PostgreSQL: Creates per-workspace schema
   *
   * @param workspaceId
   * @returns Schema name (or empty string for D1)
   */
  public async createWorkspaceDBSchema(workspaceId: string): Promise<string> {
    // D1/SQLite doesn't support schemas - we use workspaceId column filtering instead
    if (isD1Environment()) {
      return '';
    }

    const schemaName = getWorkspaceSchemaName(workspaceId);
    const queryRunner = this.coreDataSource.createQueryRunner();

    try {
      await queryRunner.createSchema(schemaName, true);

      return schemaName;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   *
   * Delete a DB schema for a workspace
   *
   * For D1/SQLite: No-op (data deletion handled via workspaceId filtering)
   * For PostgreSQL: Drops per-workspace schema
   *
   * @param workspaceId
   * @returns
   */
  public async deleteWorkspaceDBSchema(workspaceId: string): Promise<void> {
    // D1/SQLite doesn't have schemas - workspace data cleanup done via workspaceId column
    if (isD1Environment()) {
      // TODO: In D1, we should delete all records with this workspaceId
      // For now, this is a no-op - implement CASCADE delete or batch cleanup
      return;
    }

    const schemaName = getWorkspaceSchemaName(workspaceId);
    const queryRunner = this.coreDataSource.createQueryRunner();

    try {
      await queryRunner.dropSchema(schemaName, true, true);
    } finally {
      await queryRunner.release();
    }
  }

  public async executeRawQuery(
    _query: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _parameters: any[] = [],
    _workspaceId: string,
    _transactionManager?: EntityManager,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    throw new PermissionsException(
      'Method not allowed as permissions are not handled at datasource level.',
      PermissionsExceptionCode.METHOD_NOT_ALLOWED,
      {
        userFriendlyMessage: msg`This operation is not allowed. Please try a different approach or contact support if you need assistance.`,
      },
    );
  }
}
