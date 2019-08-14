import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnInit,
    Output,
    ViewChild,
    ViewEncapsulation
} from '@angular/core';

import { columnFactory, createDS, PblDataSource, PblNgridComponent } from '@pebula/ngrid';
import { PblColumnDefinition, PblNgridColumnSet } from '@pebula/ngrid/lib/table';
import { PblNgridDataMatrixRow } from '@pebula/ngrid/target-events';
import { Observable } from 'rxjs';

import { OperatorService, Permission } from 'app/core/core-services/operator.service';
import { StorageService } from 'app/core/core-services/storage.service';
import { BaseRepository } from 'app/core/repositories/base-repository';
import { BaseFilterListService } from 'app/core/ui-services/base-filter-list.service';
import { BaseSortListService } from 'app/core/ui-services/base-sort-list.service';
import { ViewportService } from 'app/core/ui-services/viewport.service';
import { BaseModel } from 'app/shared/models/base/base-model';
import { BaseProjectableViewModel } from 'app/site/base/base-projectable-view-model';
import { BaseViewModel } from 'app/site/base/base-view-model';
import { BaseViewModelWithContentObject } from 'app/site/base/base-view-model-with-content-object';

/**
 * To hide columns via restriction
 */
export interface ColumnRestriction {
    columnName: string;
    permission: Permission;
}

/**
 * Powerful list view table component.
 *
 * Creates a sort-filter-bar and table with virtual scrolling, where projector and multi select is already
 * embedded
 *
 * Takes a repository-service, a sort-service and a filter-service as an input to display data
 * Requires multi-select information
 * Double binds selected rows
 *
 * required both columns definition and a transclusion slot using the ".columns" slot as selector
 *
 * Can inform about changes in the DataSource
 *
 * !! Due to bugs in Firefox, ALL inputs to os-list-view-table need to be simple objects.
 *    NO getter, NO return of a function
 *    If otherwise more logic is required, use `changeDetectionStrategy.OnPush`
 *    in your component
 *
 * @example
 * ```html
 * <os-list-view-table
 *     [repo]="motionRepo"
 *     [filterService]="filterService"
 *     [sortService]="sortService"
 *     [columns]="motionColumnDefinition"
 *     [restricted]="restrictedColumns"
 *     [hiddenInMobile]="['state']"
 *     [allowProjector]="false"
 *     [multiSelect]="isMultiSelect"
 *     listStorageKey="motion"
 *     [(selectedRows)]="selectedRows"
 *     (dataSourceChange)="onDataSourceChange($event)"
 * >
 *     <div *pblNgridCellDef="'identifier'; row as motion" class="cell-slot">
 *         {{ motion.identifier }}
 *     </div>
 * </os-list-view-table>
 * ```
 */
@Component({
    selector: 'os-list-view-table',
    templateUrl: './list-view-table.component.html',
    styleUrls: ['./list-view-table.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class ListViewTableComponent<V extends BaseViewModel, M extends BaseModel> implements OnInit {
    /**
     * Declare the table
     */
    @ViewChild(PblNgridComponent, { static: false })
    private ngrid: PblNgridComponent;

    /**
     * The required repository
     */
    @Input()
    public repo: BaseRepository<V, M, any>;

    /**
     * The currently active sorting service for the list view
     */
    @Input()
    public sortService: BaseSortListService<V>;

    /**
     * The currently active filter service for the list view. It is supposed to
     * be a FilterListService extendingFilterListService.
     */
    @Input()
    public filterService: BaseFilterListService<V>;

    /**
     * Current state of the multi select mode.
     */
    @Input()
    private multiSelect = false;

    /**
     * If a Projector column should be shown (at all)
     */
    @Input()
    private allowProjector = true;

    /**
     * columns to hide in mobile mode
     */
    @Input()
    public hiddenInMobile: string[];

    /**
     * To hide columns for users with insufficient permissions
     */
    @Input()
    public restricted: ColumnRestriction[];

    /**
     * An array of currently selected items, upon which multi select actions can be performed
     * see {@link selectItem}.
     */
    @Input()
    private selectedRows: V[];

    /**
     * Double binding the selected rows
     */
    @Output()
    private selectedRowsChange = new EventEmitter<V[]>();

    /**
     * The specific column definition to display in the table
     */
    @Input()
    public columns: PblColumnDefinition[] = [];

    @Input()
    public filterProps: string[];

    /**
     * Key to restore scroll position after navigating
     */
    @Input()
    public listStorageKey: string;

    /**
     * Wether or not to show the filter bar
     */
    @Input()
    public showFilterBar = true;

    /**
     * Inform about changes in the dataSource
     */
    @Output()
    public dataSourceChange = new EventEmitter<PblDataSource<V>>();

    /**
     * test data source
     */
    public dataSource: PblDataSource<V>;

    /**
     * Minimal column width
     */
    private columnMinWidth = '60px';

    /**
     * The column set to display in the table
     */
    public columnSet: PblNgridColumnSet;

    /**
     * Check if mobile and required semaphore for change detection
     */
    private isMobile: boolean;

    /**
     * Search input value
     */
    public inputValue: string;

    /**
     * Flag to indicate, whether the table is loading the first time or not.
     * Otherwise the `DataSource` will be empty, if there is a query stored in the local-storage.
     */
    private initialLoading = true;

    /**
     * Most, of not all list views require these
     */
    private get defaultColumns(): PblColumnDefinition[] {
        const columns = [
            {
                prop: 'selection',
                label: '',
                width: this.columnMinWidth
            }
        ];

        if (this.allowProjector && this.operator.hasPerms('core.can_manage_projector')) {
            columns.push({
                prop: 'projector',
                label: '',
                width: this.columnMinWidth
            });
        }

        return columns;
    }

    /**
     * Gets the amount of filtered data
     */
    public get countFilter(): number {
        return this.dataSource.filteredData.length;
    }

    /**
     * @returns The total length of the data-source.
     */
    public get totalCount(): number {
        return this.dataSource.length;
    }

    /**
     * @returns the repositories `viewModelListObservable`
     */
    private get viewModelListObservable(): Observable<V[]> {
        return this.repo.getViewModelListObservable();
    }

    /**
     * Define which columns to hide. Uses the input-property
     * "hide" to hide individual columns
     */
    public get hiddenColumns(): string[] {
        let hidden: string[] = [];

        if (this.multiSelect) {
            hidden.push('projector');
        } else {
            hidden.push('selection');
        }

        if (this.isMobile && this.hiddenInMobile && this.hiddenInMobile.length) {
            hidden = hidden.concat(this.hiddenInMobile);
        }

        if (this.restricted && this.restricted.length) {
            const restrictedColumns = this.restricted
                .filter(restriction => !this.operator.hasPerms(restriction.permission))
                .map(restriction => restriction.columnName);
            hidden = hidden.concat(restrictedColumns);
        }
        return hidden;
    }

    /**
     * Yep it's a constructor.
     *
     * @param store: Access the scroll storage key
     */
    public constructor(
        private operator: OperatorService,
        vp: ViewportService,
        private store: StorageService,
        private cd: ChangeDetectorRef
    ) {
        vp.isMobileSubject.subscribe(mobile => {
            if (mobile !== this.isMobile) {
                this.cd.markForCheck();
            }
            this.isMobile = mobile;
        });
    }

    public ngOnInit(): void {
        // Create ans observe dataSource
        this.dataSource = createDS<V>()
            .onTrigger(() => {
                let listObservable: Observable<V[]>;
                if (this.filterService && this.sortService) {
                    // filtering and sorting
                    this.filterService.initFilters(this.viewModelListObservable);
                    this.sortService.initSorting(this.filterService.outputObservable);
                    listObservable = this.sortService.outputObservable;
                } else if (this.filterService) {
                    // only filter service
                    this.filterService.initFilters(this.viewModelListObservable);
                    listObservable = this.filterService.outputObservable;
                } else if (this.sortService) {
                    // only sorting
                    this.sortService.initSorting(this.viewModelListObservable);
                    listObservable = this.sortService.outputObservable;
                } else {
                    // none of both
                    listObservable = this.viewModelListObservable;
                }
                return listObservable;
            })
            .create();

        const filterPredicate = (item: V): boolean => {
            if (!this.inputValue) {
                return true;
            }

            if (this.inputValue) {
                // filter by ID
                const trimmedInput = this.inputValue.trim().toLowerCase();
                const idString = '' + item.id;
                const foundId =
                    idString
                        .trim()
                        .toLowerCase()
                        .indexOf(trimmedInput) !== -1;
                if (foundId) {
                    return true;
                }

                // custom filter predicates
                if (this.filterProps && this.filterProps.length) {
                    for (const prop of this.filterProps) {
                        let propertyAsString = '';
                        // If the property is a function, call it.
                        if (typeof item[prop] === 'function') {
                            propertyAsString = '' + item[prop]();
                        } else {
                            propertyAsString = '' + item[prop];
                        }

                        if (!!propertyAsString) {
                            const foundProp =
                                propertyAsString
                                    .trim()
                                    .toLowerCase()
                                    .indexOf(trimmedInput) !== -1;

                            if (foundProp) {
                                return true;
                            }
                        }
                    }
                }
            }
        };

        this.dataSource.setFilter(filterPredicate);

        // inform listening components about changes in the data source
        this.dataSource.onSourceChanged.subscribe(() => {
            this.dataSourceChange.next(this.dataSource);
            this.checkSelection();
        });

        // data selection
        this.dataSource.selection.changed.subscribe(selection => {
            this.selectedRows = selection.source.selected;
            this.selectedRowsChange.emit(this.selectedRows);
        });

        // Define the columns. Has to be in the OnInit cause "columns" is slower than
        // the constructor of this class
        this.columnSet = columnFactory()
            .default({ width: this.columnMinWidth })
            .table(...this.defaultColumns, ...this.columns)
            .build();

        // restore scroll position
        if (this.listStorageKey) {
            this.scrollToPreviousPosition(this.listStorageKey);
            this.restoreSearchQuery(this.listStorageKey);
        }
    }

    /**
     * Generic click handler for rows. Allow so (multi) select anywhere
     * @param event the clicked row
     */
    public onSelectRow(event: PblNgridDataMatrixRow<V>): void {
        if (this.multiSelect) {
            const clickedModel: V = event.row;
            const alreadySelected = this.dataSource.selection.isSelected(clickedModel);
            if (alreadySelected) {
                this.dataSource.selection.deselect(clickedModel);
            } else {
                this.dataSource.selection.select(clickedModel);
            }
        }
    }

    /**
     * Depending on the view, the view model in the row can either be a
     * `BaseViewModelWithContentObject` or a `BaseViewModelWithContentObject`.
     * In the first case, we want to get the content object rather than
     * the object itself for the projection button.
     *
     * @param viewModel The model of the table
     * @returns a view model that can be projected
     */
    public getProjectable(
        viewModel: BaseViewModelWithContentObject | BaseProjectableViewModel
    ): BaseProjectableViewModel {
        const withContent = viewModel as BaseViewModelWithContentObject;
        return !!withContent.contentObject ? withContent.contentObject : viewModel;
    }

    /**
     * Central search/filter function. Can be extended and overwritten by a filterPredicate.
     * Functions for that are usually called 'setFulltextFilter'
     *
     * @param event the string to search for
     */
    public searchFilter(filterValue: string): void {
        if (this.listStorageKey) {
            this.saveSearchQuery(this.listStorageKey, filterValue);
        }
        this.inputValue = filterValue;
        if (this.initialLoading) {
            this.initialLoading = false;
        } else {
            this.dataSource.syncFilter();
        }
    }

    /**
     * Loads the scroll-index from the storage
     *
     * @param key the key of the scroll index
     * @returns the scroll index or 0 if not found
     */
    public async getScrollIndex(key: string): Promise<number> {
        const scrollIndex = await this.store.get<number>(`scroll_${key}`);
        return scrollIndex ? scrollIndex : 0;
    }

    /**
     * Saves the given query to restore it later, if navigating to other sites happened.
     *
     * @param key The `StorageKey` for the list-view.
     * @param query The query, that should be stored.
     */
    public saveSearchQuery(key: string, query: string): void {
        this.store.set(`query_${key}`, query);
    }

    /**
     * Function to load any query from the store for the given `StorageKey`.
     *
     * @param key The `StorageKey` for the list-view.
     */
    public async restoreSearchQuery(key: string): Promise<void> {
        this.inputValue = await this.store.get<string>(`query_${key}`);
    }

    /**
     * Automatically scrolls to a stored scroll position
     *
     * TODO: Only the position will be stored, not the item.
     *       Changing the filtering and sorting will confuse the order
     *
     * TODO: getScrollIndex is not supported by virtual scrolling with the `vScrollAuto` directive.
     * Furthermore, dynamic assigning the amount of pixels in vScrollFixed
     * does not work, tying the tables to the same hight.
     */
    public scrollToPreviousPosition(key: string): void {
        this.getScrollIndex(key).then(index => {
            this.ngrid.viewport.scrollToIndex(index);
        });
    }

    /**
     * Checks the array of selected items against the datastore data. This is
     * meant to reselect items by their id even if some of their data changed,
     * and to remove selected data that don't exist anymore.
     * To be called after an update of data. Checks if updated selected items
     * are still present in the dataSource, and (re-)selects them. This should
     * be called as the observed datasource updates.
     */
    protected checkSelection(): void {
        if (this.multiSelect) {
            const previouslySelectedRows = [];
            this.selectedRows.forEach(selectedRow => {
                const newRow = this.dataSource.source.find(item => item.id === selectedRow.id);
                if (newRow) {
                    previouslySelectedRows.push(newRow);
                }
            });

            this.dataSource.selection.clear();
            this.dataSource.selection.select(...previouslySelectedRows);
        }
    }
}
